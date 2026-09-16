/**
 * useSearchDiscovery.ts — data for the Search tab's idle (pre-query) state.
 *
 * Two independent sources, loaded together:
 *  - popular  → "Popular right now" grid. Public, always attempted. It is the
 *               screen's primary content, so its failure becomes `error`.
 *  - recent   → "Recent searches". The caller's own history — only fetched with a
 *               real session, and any failure just hides the section rather than
 *               becoming a screen-level error (a 401 on a bypass token, or
 *               offline, is nothing the customer needs to see).
 *
 * Mirrors useHomeData / useItemDetail: a mounted-ref + request-id guard so a slow
 * response can't land after a refresh, a `refresh` for the error-state retry
 * button, and the app-wide logging severity split (5xx / unreachable →
 * reportError, expected 4xx → warn).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useVegMode } from '../context/VegModeContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  fetchPopularSearches,
  fetchRecentSearches,
  removeRecentSearch,
} from '../services/search';
import type { PopularSearch, RecentSearch } from '../types/search';

interface UseSearchDiscoveryResult {
  popular: PopularSearch[];
  recent: RecentSearch[];
  /** "Pure veg mode is on — showing only vegetarian food", from the backend. */
  vegBannerText: string | null;
  isLoading: boolean;
  /** Set only when the popular grid — the primary content — could not load. */
  error: string | null;
  /** Full reload, both sections; drives the error-state "Try again" button. */
  refresh: () => Promise<void>;
  /** Re-pull just the recent list, silently — after the customer runs a search. */
  refreshRecent: () => Promise<void>;
  /** Optimistically drop a recent row and tell the server; restore it on failure. */
  removeRecent: (id: string) => void;
}

const isExpected4xx = (err: unknown): err is ApiError =>
  err instanceof ApiError && err.status >= 400 && err.status < 500;

export function useSearchDiscovery(): UseSearchDiscoveryResult {
  const { isAuthenticated } = useAuth();
  const { enabled: vegOnly } = useVegMode();

  const [popular, setPopular] = useState<PopularSearch[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [vegBannerText, setVegBannerText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only the newest load may write state — guards against a slow response landing
  // after veg mode changed or the customer pulled to refresh.
  const requestRef = useRef(0);

  const loadRecent = useCallback(async (): Promise<RecentSearch[]> => {
    if (!isAuthenticated) return [];
    try {
      return await fetchRecentSearches();
    } catch (err) {
      if (isExpected4xx(err)) {
        logger.warn('search', `Recent searches unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('search', 'Failed to load recent searches', err);
      }
      return [];
    }
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    setIsLoading(true);
    setError(null);

    // Kick both off together; recent never rejects (loadRecent swallows).
    const recentPromise = loadRecent();

    let nextPopular: PopularSearch[] | null = null;
    let nextVegBannerText: string | null = null;
    let popularError: string | null = null;
    try {
      const result = await fetchPopularSearches(vegOnly);
      nextPopular = result.popular;
      nextVegBannerText = result.vegBannerText;
    } catch (err) {
      if (isExpected4xx(err)) {
        logger.warn('search', `Popular searches unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('search', 'Failed to load popular searches', err);
      }
      popularError =
        err instanceof Error && err.message
          ? err.message
          : "Couldn't load popular searches. Check your connection and try again.";
    }

    const nextRecent = await recentPromise;
    if (!isCurrent()) return;

    setRecent(nextRecent);
    if (nextPopular) {
      setPopular(nextPopular);
      setVegBannerText(nextVegBannerText);
      setError(null);
    } else {
      setPopular([]);
      setVegBannerText(null);
      setError(popularError);
    }
    setIsLoading(false);
  }, [loadRecent, vegOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshRecent = useCallback(async () => {
    const next = await loadRecent();
    if (mountedRef.current) setRecent(next);
  }, [loadRecent]);

  const removeRecent = useCallback((id: string) => {
    let snapshot: RecentSearch[] = [];
    setRecent((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });
    removeRecentSearch(id).catch((err) => {
      logger.warn('search', 'Could not remove recent search', {
        reason: err instanceof ApiError ? err.code : 'unknown',
      });
      // Roll back to what the server still has.
      if (mountedRef.current) setRecent(snapshot);
    });
  }, []);

  return {
    popular,
    recent,
    vegBannerText,
    isLoading,
    error,
    refresh: load,
    refreshRecent,
    removeRecent,
  };
}
