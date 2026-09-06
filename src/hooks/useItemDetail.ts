/**
 * useItemDetail.ts — data for the dish customization screen.
 *
 * One call to `GET /api/items/:id` (via src/services/items.ts) returns the dish,
 * its option groups, and its category/restaurant names. Mirrors useHomeData's
 * shape: a `loading`/`error` pair, a stale-response guard, and a `refresh` for
 * the error-state retry button. The severity split follows the app-wide rule —
 * an expected 4xx (item pulled from the menu → 404) is a warn, a 5xx/unreachable
 * is a reported error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchItem } from '../services/items';
import type { ItemDetail } from '../types/restaurant';

interface UseItemDetailResult {
  item: ItemDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useItemDetail(id: string | undefined): UseItemDetailResult {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only the newest request may write state — guards against a re-fetch landing
  // after the id has changed.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    if (!id) {
      if (isCurrent()) {
        setItem(null);
        setError('This dish could not be found.');
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const detail = await fetchItem(id);
      if (isCurrent()) setItem(detail);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('item', `Item ${id} unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('item', 'Failed to load item detail', err, { id });
      }
      if (isCurrent()) {
        setItem(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? 'This dish is no longer on the menu.'
            : err instanceof Error && err.message
              ? err.message
              : 'Could not load this dish.',
        );
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { item, isLoading, error, refresh: load };
}
