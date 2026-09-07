/**
 * useFavoriteRestaurants.ts — the customer's favorited restaurants for the
 * Favorites screen (`app/favorites/index.tsx`), reached from the Profile tab.
 *
 * Pages `GET /api/users/me/favorites/restaurants` (src/services/favorites.ts).
 * A near-copy of useOrders: mounted guard, request-id guard so a stale page
 * can't land on fresh state, the app-wide severity split (`ApiError` 4xx → warn,
 * 5xx / unreachable → reportError), and a 401 surfaced as `notSignedIn` rather
 * than an error. `remove()` drops a restaurant optimistically and rolls back on
 * failure.
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
        const res = await listFavoriteRestaurants(targetPage);
        if (!isCurrent()) return;
        setRestaurants((prev) =>
          append ? [...prev, ...res.restaurants] : res.restaurants,
        );
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
    let snapshot: Restaurant[] = [];
    setRestaurants((prev) => {
      snapshot = prev;
      return prev.filter((r) => r._id !== restaurantId);
    });
    setTotal((t) => Math.max(0, t - 1));

    removeFavoriteRestaurant(restaurantId).catch((err) => {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('favorites', `Could not un-favorite — ${err.status} ${err.code}`, {
          restaurantId,
          code: err.code,
        });
      } else {
        reportError('favorites', 'Failed to un-favorite restaurant', err, { restaurantId });
      }
      // Put it back where it was.
      if (mountedRef.current) {
        setRestaurants(snapshot);
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
