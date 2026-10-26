/**
 * useFavoriteRestaurants.ts — the customer's favorited restaurants for the
 * Favorites screen (`app/favorites/index.tsx`), reached from the Profile tab.
 *
 * Pages `GET /api/users/me/favorites/restaurants` (src/services/favorites.ts).
 * A near-copy of useOrders: mounted guard, request-id guard so a stale page
 * can't land on fresh state, the app-wide severity split (`ApiError` 4xx → warn,
 * 5xx / unreachable → reportError), and a 401 surfaced as `notSignedIn` rather
 * than an error. `remove()` drops a restaurant optimistically and rolls back on
 * failure — just that one row, back at its index.
 *
 * The endpoint pages by skip/limit, so every un-favorite shifts the rows after
 * it one place earlier on the server: page N+1 would now start past rows that
 * were never shown. `loadMore` therefore re-reads from the page those shifted
 * rows now sit on and de-dupes by id, so nothing is skipped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  listFavoriteRestaurants,
  removeFavoriteRestaurant,
} from '../services/favorites';
import type { Restaurant } from '../types/restaurant';

interface UseFavoriteRestaurantsResult {
  restaurants: Restaurant[];
  total: number;
  isLoading: boolean;
  isRefreshing: boolean;
  isPaging: boolean;
  error: string | null;
  notSignedIn: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => void;
  /** Un-favorite a restaurant — removes it from the list right away. */
  remove: (restaurantId: string) => void;
}

/** Server page size for this endpoint (favorite.service.js → PAGE_SIZE). */
const FAVORITES_PAGE_SIZE = 20;

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useFavoriteRestaurants(): UseFavoriteRestaurantsResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaging, setIsPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);
  // Un-favorites (in flight or done) since page 1 last loaded — how far the
  // server's skip offset has shifted under the pages already on screen.
  const removedSinceLoadRef = useRef(0);
  // Ids whose DELETE is still in flight; a page fetched meanwhile may still
  // carry them, so they're filtered out rather than resurrected.
  const pendingRemovalRef = useRef(new Set<string>());

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const requestId = ++requestRef.current;
      const isCurrent = () =>
        mountedRef.current && requestRef.current === requestId;
      const append = targetPage > 1;

      if (!hasServerToken) {
        if (isCurrent()) {
          setNotSignedIn(true);
          setRestaurants([]);
          setError(null);
          setIsLoading(false);
          setIsRefreshing(false);
          setIsPaging(false);
        }
        return;
      }

      if (append) setIsPaging(true);
      else {
        if (loadedOnceRef.current) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);
        setNotSignedIn(false);
      }

      try {
        // When appending after removals, start from the page the shifted rows
        // now sit on (over-fetching is harmless — the merge de-dupes by id).
        const shift = append ? removedSinceLoadRef.current : 0;
        const firstPage = Math.max(1, targetPage - Math.ceil(shift / FAVORITES_PAGE_SIZE));
        const responses = await Promise.all(
          Array.from({ length: targetPage - firstPage + 1 }, (_, i) =>
            listFavoriteRestaurants(firstPage + i),
          ),
        );
        if (!isCurrent()) return;
        const res = responses[responses.length - 1];
        const fetched = responses
          .flatMap((r) => r.restaurants)
          .filter((r) => !pendingRemovalRef.current.has(r._id));
        if (!append) removedSinceLoadRef.current = pendingRemovalRef.current.size;
        setRestaurants((prev) => {
          if (!append) return fetched;
          const seen = new Set(prev.map((r) => r._id));
          return [...prev, ...fetched.filter((r) => !seen.has(r._id))];
        });
        setTotal(res.pagination.total);
        setPages(res.pagination.pages);
        setPage(targetPage);
        loadedOnceRef.current = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('favorites', 'Favorites need a signed-in customer — 401', { code: err.code });
          if (isCurrent()) {
            setNotSignedIn(true);
            if (!append) setRestaurants([]);
          }
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('favorites', `Favorites unavailable — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your favorites.'));
        } else {
          reportError('favorites', 'Failed to load favorites', err, { page: targetPage });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your favorites.'));
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsPaging(false);
        }
      }
    },
    [hasServerToken],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const hasMore = page < pages;

  const loadMore = useCallback(() => {
    if (isLoading || isPaging || !hasMore) return;
    fetchPage(page + 1);
  }, [isLoading, isPaging, hasMore, page, fetchPage]);

  const remove = useCallback((restaurantId: string) => {
    let removedRow: Restaurant | null = null;
    let removedIndex = -1;
    setRestaurants((prev) => {
      const index = prev.findIndex((r) => r._id === restaurantId);
      if (index === -1) return prev;
      removedRow = prev[index];
      removedIndex = index;
      return prev.filter((r) => r._id !== restaurantId);
    });
    setTotal((t) => Math.max(0, t - 1));
    pendingRemovalRef.current.add(restaurantId);
    removedSinceLoadRef.current += 1;

    removeFavoriteRestaurant(restaurantId)
      .then(() => {
        pendingRemovalRef.current.delete(restaurantId);
      })
      .catch((err) => {
        pendingRemovalRef.current.delete(restaurantId);
        removedSinceLoadRef.current = Math.max(0, removedSinceLoadRef.current - 1);
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('favorites', `Could not un-favorite — ${err.status} ${err.code}`, {
            restaurantId,
            code: err.code,
          });
        } else {
          reportError('favorites', 'Failed to un-favorite restaurant', err, { restaurantId });
        }
        // Put just this row back where it was — restoring a whole snapshot would
        // resurrect other rows removed in the meantime.
        const row = removedRow as Restaurant | null;
        if (mountedRef.current && row) {
          setRestaurants((prev) => {
            if (prev.some((r) => r._id === row._id)) return prev;
            const next = [...prev];
            next.splice(Math.min(removedIndex, next.length), 0, row);
            return next;
          });
          setTotal((t) => t + 1);
        }
      });
  }, []);

  return {
    restaurants,
    total,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    hasMore,
    refresh: () => fetchPage(1),
    loadMore,
    remove,
  };
}
