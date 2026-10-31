/**
 * useCartScreen.ts — data + mutations for the cart tab (`app/(tabs)/cart.tsx`).
 *
 * One call to `GET /api/cart` (src/services/cart.ts) returns the lines, the
 * storefront summary, and the fully server-computed `bill`. Quantity edits and
 * line removals go straight back to the API, which returns a fresh
 * `{ cart, bill }` snapshot — this hook never adds up money itself.
 *
 * Mirrors useItemDetail / useRestaurantDetail: a mounted guard, a request-id
 * guard so a stale response can't land on fresh state, and the app-wide severity
 * split (`ApiError` 4xx → warn, 5xx / unreachable → reportError). A 401 (bypass
 * or expired session — the cart is customer-token-only) is surfaced separately as
 * `notSignedIn` rather than as an error.
 *
 * Every successful response is also pushed into the device-local `CartContext`
 * so the tab badge and Home `CartBar` stay in agreement with what this screen
 * shows (see that context's `syncFromServer`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart as useCartCache } from '../context/CartContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { useOfferActions } from './useOfferActions';
import {
  applyPromo as applyPromoRequest,
  removePromo as removePromoRequest,
  getCart,
  removeCartLine,
  toCartCachePayload,
  updateCartLine,
  type CartSnapshot,
} from '../services/cart';

interface UseCartScreenResult {
  snapshot: CartSnapshot | null;
  isLoading: boolean;
  error: string | null;
  /** The cart needs a signed-in customer and this session isn't one. */
  notSignedIn: boolean;
  /** A quantity / remove call is in flight — the bill on screen is being recomputed. */
  billStale: boolean;
  /** Line ids with an in-flight mutation, for a per-row spinner / disabled state. */
  pendingLineIds: Set<string>;
  /** Transient message for a mutation that failed (the load error uses `error`). */
  actionError: string | null;
  /** The coupon code currently applied to the bill, or `null`. */
  appliedCode: string | null;
  /** A coupon apply is in flight. */
  promoPending: boolean;
  refresh: () => Promise<void>;
  /** Re-fetch without the skeleton — the tab regaining focus (an order may have emptied it). */
  refreshQuietly: () => Promise<void>;
  /** Set an absolute quantity for a line; `0` removes it. */
  setLineQty: (lineId: string, qty: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  /** Apply a coupon code; resolves `true` on success, `false` on a rejected code. */
  applyPromo: (code: string) => Promise<boolean>;
  /** Take the applied coupon code back off the cart. */
  removePromo: () => Promise<void>;
  dismissActionError: () => void;
  /** Personal offer Apply / Remove (live activity); `pending` holds the bill as stale. */
  offer: ReturnType<typeof useOfferActions>;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useCartScreen(): UseCartScreenResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const { syncFromServer } = useCartCache();

  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [promoPending, setPromoPending] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);

  const applyServer = useCallback(
    (next: CartSnapshot) => {
      setSnapshot(next);
      syncFromServer(toCartCachePayload(next));
    },
    [syncFromServer],
  );

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current && requestRef.current === requestId;

    if (!hasServerToken) {
      if (isCurrent()) {
        setNotSignedIn(true);
        setSnapshot(null);
        setError(null);
        setIsLoading(false);
      }
      return;
    }

    if (!quiet) setIsLoading(true);
    setError(null);
    setNotSignedIn(false);

    try {
      const next = await getCart();
      if (!isCurrent()) return;
      applyServer(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('cart', 'Cart needs a signed-in customer — 401', { code: err.code });
        if (isCurrent()) {
          setNotSignedIn(true);
          setSnapshot(null);
        }
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('cart', `Cart unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) setError(messageFor(err, 'Could not load your cart.'));
      } else {
        reportError('cart', 'Failed to load cart', err);
        if (isCurrent()) setError(messageFor(err, 'Could not load your cart.'));
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [hasServerToken, applyServer]);

  useEffect(() => {
    load();
  }, [load]);

  const markPending = useCallback((lineId: string, on: boolean) => {
    setPendingLineIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  }, []);

  const runLineMutation = useCallback(
    async (lineId: string, op: () => Promise<CartSnapshot>) => {
      if (!snapshot) return;
      setActionError(null);
      markPending(lineId, true);
      try {
        const next = await op();
        if (!mountedRef.current) return;
        applyServer(next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('cart', 'Cart mutation rejected — 401', { code: err.code });
          if (mountedRef.current) {
            setNotSignedIn(true);
            setSnapshot(null);
          }
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('cart', `Cart mutation rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (mountedRef.current) {
            setActionError(messageFor(err, 'That change didn’t go through.'));
          }
        } else {
          reportError('cart', 'Cart mutation failed', err, { lineId });
          if (mountedRef.current) {
            setActionError('Something went wrong. Please try again.');
          }
        }
      } finally {
        if (mountedRef.current) markPending(lineId, false);
      }
    },
    [snapshot, applyServer, markPending],
  );

  const setLineQty = useCallback(
    (lineId: string, qty: number) =>
      runLineMutation(lineId, () => updateCartLine(lineId, qty)),
    [runLineMutation],
  );

  const removeLine = useCallback(
    (lineId: string) => runLineMutation(lineId, () => removeCartLine(lineId)),
    [runLineMutation],
  );

  const applyPromo = useCallback(
    async (code: string): Promise<boolean> => {
      const trimmed = code.trim();
      if (!trimmed || promoPending) return false;
      setActionError(null);
      setPromoPending(true);
      try {
        const next = await applyPromoRequest(trimmed);
        if (!mountedRef.current) return false;
        applyServer(next);
        return next.bill.discountAmount > 0;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          if (mountedRef.current) {
            setNotSignedIn(true);
            setSnapshot(null);
          }
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('cart', `Coupon rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (mountedRef.current) {
            setActionError(messageFor(err, 'That coupon code isn’t valid for this cart.'));
          }
        } else {
          reportError('cart', 'Coupon apply failed', err);
          if (mountedRef.current) setActionError('Something went wrong. Please try again.');
        }
        return false;
      } finally {
        if (mountedRef.current) setPromoPending(false);
      }
    },
    [promoPending, applyServer],
  );

  const removePromo = useCallback(async () => {
    if (promoPending) return;
    setActionError(null);
    setPromoPending(true);
    try {
      const next = await removePromoRequest();
      if (!mountedRef.current) return;
      applyServer(next);
    } catch (err) {
      reportError('cart', 'Coupon remove failed', err);
      if (mountedRef.current) setActionError(messageFor(err, 'Couldn’t remove the coupon. Please try again.'));
    } finally {
      if (mountedRef.current) setPromoPending(false);
    }
  }, [promoPending, applyServer]);

  const offer = useOfferActions(applyServer);

  return {
    snapshot,
    isLoading,
    error,
    notSignedIn,
    billStale: pendingLineIds.size > 0 || offer.pending,
    pendingLineIds,
    actionError,
    // From the server's bill, so a coupon applied before a restart is still named (and removable).
    appliedCode: snapshot?.bill.appliedCode ?? null,
    promoPending,
    refresh: () => load(),
    refreshQuietly: () => load({ quiet: true }),
    setLineQty,
    removeLine,
    applyPromo,
    removePromo,
    dismissActionError: useCallback(() => setActionError(null), []),
    offer,
  };
}
