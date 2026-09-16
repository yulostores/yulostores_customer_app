/**
 * useTypeahead.ts — debounced suggestions for the Search tab's dropdown.
 *
 * Calls GET /api/search/typeahead 300ms after the customer stops typing, and only
 * while `enabled` — the caller turns this off once a search has actually run, so
 * the dropdown can't reappear behind the results list. A request-id guard mirrors
 * useSearchDiscovery / useHomeData: a slow response can't land after a newer
 * keystroke or after typeahead was disabled.
 */

import { useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchTypeahead } from '../services/search';
import type { TypeaheadResult } from '../types/search';

const DEBOUNCE_MS = 300;

interface UseTypeaheadResult {
  results: TypeaheadResult[];
  isLoading: boolean;
}

export function useTypeahead(query: string, enabled: boolean): UseTypeaheadResult {
  const [results, setResults] = useState<TypeaheadResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!enabled || !term) {
      requestRef.current += 1;
      setResults([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const next = await fetchTypeahead(term);
        if (requestRef.current !== requestId) return;
        setResults(next);
        setIsLoading(false);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('search', `Typeahead failed — ${err.status} ${err.code}`, {
            query: term,
            status: err.status,
            code: err.code,
          });
        } else {
          reportError('search', 'Typeahead request failed', err, { query: term });
        }
        setResults([]);
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { results, isLoading };
}
