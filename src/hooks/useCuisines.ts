/**
 * useCuisines.ts — data hook for the "Browse by cuisine" screen.
 *
 * One read of `GET /api/cuisines` (public — no `notSignedIn` state needed).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchCuisines, type Cuisine } from '../services/cuisines';

interface UseCuisinesResult {
  cuisines: Cuisine[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCuisines(): UseCuisinesResult {
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const fresh = await fetchCuisines();
      if (mountedRef.current) setCuisines(fresh);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('cuisines', `Cuisines unavailable — ${err.status} ${err.code}`, {});
      } else {
        reportError('cuisines', 'Failed to load cuisines', err);
      }
      if (mountedRef.current) {
        setError(err instanceof Error && err.message ? err.message : 'Could not load cuisines.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { cuisines, loading, error, refresh: load };
}
