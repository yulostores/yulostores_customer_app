/**
 * useFavoriteToggle.ts — the one optimistic favorite toggle behind every heart
 * in the app: the home cards, the restaurant storefront and the dish screen.
 *
 * Favorites are never held on the client. Each one lives in the backend
 * `Favorite` collection, keyed by the caller's own user id and hit through the
 * four `/api/users/me/favorites/...` endpoints in `src/services/items.ts`
 * (`req.user._id` server-side — nothing is scoped by a hard-coded id). This hook
 * owns only the shared *client* behaviour around those endpoints so every
 * surface behaves identically:
 *
 *   • `canFavorite` — false for an OTP-bypass / demo session (no real token), so
 *     a caller can skip a request that would only 401.
 *   • an optimistic flip that rolls back if the write fails.
 *   • the app-wide severity split (401 / offline → warn "skipped"; other 4xx →
 *     warn; 5xx / unreachable → reportError) — see the error-handling convention.
 *   • re-seeding from the server's `isFavorited` whenever a fresh document
 *     arrives (a list refresh, a re-fetch), except while our own write is still
 *     in flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  favoriteItem,
  favoriteRestaurant,
  unfavoriteItem,
  unfavoriteRestaurant,
} from '../services/items';

export type FavoriteEntity = 'restaurant' | 'item';

const ADD: Record<FavoriteEntity, (id: string) => Promise<unknown>> = {
  restaurant: favoriteRestaurant,
  item: favoriteItem,
};
const REMOVE: Record<FavoriteEntity, (id: string) => Promise<unknown>> = {
  restaurant: unfavoriteRestaurant,
  item: unfavoriteItem,
};

interface UseFavoriteToggleResult {
  /** Current state — optimistic while a write is settling. */
  favorited: boolean;
  /**
   * Flip it. No-op when the id isn't known yet, a write is already in flight, or
   * the session can't favorite (check `canFavorite` first to prompt sign-in).
   */
  toggle: () => void;
  /** A real customer token is present — a favorite will actually persist. */
  canFavorite: boolean;
  /** A write is in flight. */
  isPending: boolean;
}

export function useFavoriteToggle(
  entity: FavoriteEntity,
  id: string | undefined,
  serverFavorited: boolean | undefined,
): UseFavoriteToggleResult {
  const { isAuthenticated, session } = useAuth();
  const canFavorite =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [favorited, setFavorited] = useState(!!serverFavorited);
  const [isPending, setIsPending] = useState(false);

  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Adopt the server's truth when a fresh document lands — but never stomp on an
  // optimistic flip the user just made that hasn't settled yet.
  useEffect(() => {
    if (!pendingRef.current) setFavorited(!!serverFavorited);
  }, [serverFavorited]);

  const toggle = useCallback(() => {
    if (!id || pendingRef.current || !canFavorite) return;

    const next = !favorited;
    setFavorited(next);
    pendingRef.current = true;
    setIsPending(true);

    (next ? ADD : REMOVE)[entity](id)
      .catch((err: unknown) => {
        if (mountedRef.current) setFavorited(!next); // roll back
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          logger.warn('favorite', 'Favorite toggle skipped', {
            entity,
            id,
            code: err.code,
            status: err.status,
          });
        } else if (
          err instanceof ApiError &&
          err.status >= 400 &&
          err.status < 500
        ) {
          logger.warn('favorite', `Favorite toggle failed — ${err.status} ${err.code}`, {
            entity,
            id,
          });
        } else {
          reportError('favorite', 'Failed to toggle favorite', err, { entity, id });
        }
      })
      .finally(() => {
        pendingRef.current = false;
        if (mountedRef.current) setIsPending(false);
      });
  }, [entity, id, favorited, canFavorite]);

  return { favorited, toggle, canFavorite, isPending };
}
