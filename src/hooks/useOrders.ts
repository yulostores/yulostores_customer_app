/**
 * useOrders.ts — the customer's order history for the Orders tab
 * (`app/(tabs)/orders.tsx`).
 *
 * Pages `GET /api/orders` (src/services/orders.ts), 20 per page, newest first.
 * Mirrors useCartScreen: a mounted guard, a request-id guard so a stale page
 * can't land on fresh state, and the app-wide severity split (`ApiError` 4xx →
 * warn, 5xx / unreachable → reportError). A 401 (bypass / expired session) is
 * surfaced as `notSignedIn` rather than an error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { listOrders, type OrderSummary } from '../services/orders';

interface UseOrdersResult {
  orders: OrderSummary[];
  total: number;
  /** First load, nothing on screen yet. */
  isLoading: boolean;
  /** A page-1 refetch while rows are already showing (pull-to-refresh). */
  isRefreshing: boolean;
  /** A "load more" page is in flight. */
  isPaging: boolean;
  error: string | null;
  notSignedIn: boolean;
  /** More pages exist beyond what's loaded. */
  hasMore: boolean;
  /** Reload from page 1 (pull-to-refresh / retry). */
  refresh: () => Promise<void>;
  /** Append the next page, if any. */
  loadMore: () => void;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useOrders(): UseOrdersResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const requestId = ++requestRef.current;
      const isCurrent = () =>
        mountedRef.current && requestRef.current === requestId;
      const append = targetPage > 1;

      if (!hasServerToken) {
        if (isCurrent()) {
          setNotSignedIn(true);
          setOrders([]);
          setError(null);
          setIsLoading(false);
          setIsRefreshing(false);
          setIsPaging(false);
        }
        return;
      }

      if (append) setIsPaging(true);
      else {
        // A page-1 fetch with rows already on screen is a refresh, not a
        // cold load — keep the list visible under the pull spinner.
        if (loadedOnceRef.current) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);
        setNotSignedIn(false);
      }

      try {
        const res = await listOrders(targetPage);
        if (!isCurrent()) return;
        setOrders((prev) => (append ? [...prev, ...res.orders] : res.orders));
        setTotal(res.total);
        setPage(targetPage);
        loadedOnceRef.current = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('orders', 'Orders need a signed-in customer — 401', { code: err.code });
          if (isCurrent()) {
            setNotSignedIn(true);
            if (!append) setOrders([]);
          }
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('orders', `Orders unavailable — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your orders.'));
        } else {
          reportError('orders', 'Failed to load orders', err, { page: targetPage });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your orders.'));
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

  const hasMore = orders.length < total;

  const loadMore = useCallback(() => {
    if (isLoading || isPaging || !hasMore) return;
    fetchPage(page + 1);
  }, [isLoading, isPaging, hasMore, page, fetchPage]);

  const refresh = useCallback(() => fetchPage(1), [fetchPage]);

  return {
    orders,
    total,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    hasMore,
    refresh,
    loadMore,
  };
}
