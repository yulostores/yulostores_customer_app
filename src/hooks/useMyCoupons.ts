/**
 * useMyCoupons — one My Coupons tab (src/services/coupons.ts): first page, pull-to-refresh and
 * load-more, with a request-id guard so a slow answer for the previous tab can't land here.
 * Skipped (and `notSignedIn`) for guests and local bypass sessions, which have no coupons.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CouponStatus, CustomerCoupon } from '../lib/coupons';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { getMyCoupon, listMyCoupons } from '../services/coupons';

/** A real customer account (not a guest, not an offline bypass session). */
export function useIsCustomerAccount(): boolean {
  const { isAuthenticated, isGuest, session } = useAuth();
  return isAuthenticated && !isGuest && !session?.bypassed && !!session?.accessToken;
}

const messageOf = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.message ? err.message : fallback;

function logFailure(what: string, err: unknown) {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500)
    logger.warn('coupons', `${what} — ${err.status} ${err.code}`, { code: err.code });
  else reportError('coupons', what, err);
}

export function useMyCoupons(status: CouponStatus) {
  const signedIn = useIsCustomerAccount();
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(signedIn);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (mode: 'first' | 'refresh') => {
      const id = ++requestRef.current;
      if (!signedIn) {
        setIsLoading(false);
        return;
      }
      setError(null);
      if (mode === 'first') {
        setIsLoading(true);
        setCoupons([]);
        setTotal(0);
      } else setIsRefreshing(true);
      try {
        const res = await listMyCoupons(status, 1);
        if (id !== requestRef.current) return;
        setCoupons(res.coupons);
        setTotal(res.total);
        setPage(1);
      } catch (err) {
        if (id !== requestRef.current) return;
        logFailure('Could not load coupons', err);
        setError(messageOf(err, 'Could not load your coupons.'));
      } finally {
        if (id === requestRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [signedIn, status],
  );

  useEffect(() => {
    load('first');
  }, [load]);

  const hasMore = coupons.length < total;
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    const id = requestRef.current;
    setIsLoadingMore(true);
    try {
      const res = await listMyCoupons(status, page + 1);
      if (id !== requestRef.current) return;
      setCoupons((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...res.coupons.filter((c) => !seen.has(c.id))];
      });
      setTotal(res.total);
      setPage(page + 1);
    } catch (err) {
      logFailure('Could not load more coupons', err);
    } finally {
      if (id === requestRef.current) setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, isLoading, status, page]);

  return {
    coupons,
    total,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    notSignedIn: !signedIn,
    refresh: () => load('refresh'),
    retry: () => load('first'),
    loadMore,
  };
}

/** One coupon for the detail screen. `notFound` for a 404 (not this customer's, or gone). */
export function useCoupon(id: string) {
  const [coupon, setCoupon] = useState<CustomerCoupon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const req = ++requestRef.current;
    setError(null);
    setIsLoading(true);
    try {
      const c = await getMyCoupon(id);
      if (req === requestRef.current) setCoupon(c);
    } catch (err) {
      if (req !== requestRef.current) return;
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else {
        logFailure('Could not load coupon', err);
        setError(messageOf(err, 'Could not load this coupon.'));
      }
    } finally {
      if (req === requestRef.current) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  return { coupon, isLoading, error, notFound, reload: load };
}
