/**
 * useCartBadge — the number on the Cart tab, reconciled against the server.
 *
 * `CartContext` is only a device-local cache (see its docstring): it is written
 * by whichever screen last touched the cart, and it survives a cold start via
 * AsyncStorage. That is fine for a badge that only appears on one screen, but the
 * Cart tab shows it everywhere, so a cache that has drifted — the cart was
 * checked out on another device, it expired, or the last session belonged to a
 * different account — would be visible app-wide and wrong.
 *
 * So this hook re-reads `GET /api/cart` (the system of record) and pushes the
 * result back through `syncFromServer`:
 *   • once the persisted session and the cached cart have both resolved,
 *   • again whenever the signed-in customer changes,
 *   • and again each time the app returns to the foreground.
 *
 * Failure policy: only a 401 (or a session that can't have a server cart at all)
 * zeroes the badge, because that is a positive answer — this session has no cart.
 * A 4xx/5xx/offline failure leaves the cached count alone; a flaky network is no
 * reason to tell someone their cart is empty. Severities follow the app-wide
 * split — 4xx warn, 5xx / unreachable reportError.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { getCart, toCartCachePayload } from '../services/cart';

export function useCartBadge(): number {
  const { isAuthenticated, isReady: authReady, session } = useAuth();
  const { itemCount, hydrated: cartHydrated, syncFromServer } = useCart();

  // Same predicate the cart screen uses: the cart endpoints are customer-token
  // only, so an OTP-bypass session has nothing to read. A guest session does —
  // it carries real backend tokens — and keeps its cart until it signs in.
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;
  const userId = session?.user._id ?? null;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Guards a slow response from landing after a newer one (account switch,
  // foreground while a request is still in flight).
  const requestRef = useRef(0);

  const reconcile = useCallback(async () => {
    // Both stores are read from disk asynchronously. Acting before they resolve
    // would wipe a perfectly good cached cart on every cold start.
    if (!authReady || !cartHydrated) return;

    const requestId = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current && requestRef.current === requestId;

    if (!hasServerToken) {
      syncFromServer(null);
      return;
    }

    try {
      const snapshot = await getCart();
      if (!isCurrent()) return;
      syncFromServer(toCartCachePayload(snapshot));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('cart', 'Cart badge cleared — session is not a customer', {
          code: err.code,
        });
        if (isCurrent()) syncFromServer(null);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('cart', `Cart badge not refreshed — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('cart', 'Failed to refresh the cart badge', err);
      }
    }
  }, [authReady, cartHydrated, hasServerToken, syncFromServer]);

  // `userId` is a dependency so that signing in as someone else re-reads *their*
  // cart rather than keeping the previous customer's count on screen.
  useEffect(() => {
    reconcile();
  }, [reconcile, userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') reconcile();
    });
    return () => sub.remove();
  }, [reconcile]);

  return itemCount;
}
