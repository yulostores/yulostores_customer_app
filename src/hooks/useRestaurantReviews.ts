/**
 * useRestaurantReviews.ts — paginated reviews for a restaurant's storefront.
 *
 * One call per page (`GET /api/restaurants/:id/reviews`, public — no auth
 * required, so no `notSignedIn` state like the customer-scoped hooks). Pages
 * accumulate into a single flat list as `loadMore()` is called, mirroring the
 * restaurant menu's own lazy-section paging.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchRestaurantReviews, type RestaurantReview } from '../services/restaurants';

interface UseRestaurantReviewsResult {
  reviews: RestaurantReview[];
  total: number;
  /** More pages exist beyond what's loaded. */
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
}

export function useRestaurantReviews(restaurantId: string | undefined): UseRestaurantReviewsResult {
  const [reviews, setReviews] = useState<RestaurantReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!restaurantId) return;
      try {
        const data = await fetchRestaurantReviews(restaurantId, nextPage);
        if (!mountedRef.current) return;
        setReviews((prev) => (nextPage === 1 ? data.reviews : [...prev, ...data.reviews]));
        setTotal(data.total);
        setPage(data.page);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('restaurant', `Reviews unavailable — ${err.status} ${err.code}`, { restaurantId });
        } else {
          reportError('restaurant', 'Failed to load restaurant reviews', err, { restaurantId });
        }
        setError(err instanceof Error && err.message ? err.message : 'Could not load reviews.');
      }
    },
    [restaurantId],
  );

  useEffect(() => {
    setReviews([]);
    setTotal(0);
    setPage(0);
    setError(null);
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPage(1).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
  }, [restaurantId, fetchPage]);

  const hasMore = reviews.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(page + 1).finally(() => {
      if (mountedRef.current) setLoadingMore(false);
    });
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  return { reviews, total, hasMore, loading, loadingMore, error, loadMore };
}
