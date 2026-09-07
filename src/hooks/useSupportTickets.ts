/**
 * useSupportTickets.ts — the customer's Help & Support tickets for the
 * "Your requests" screen (`app/help/requests.tsx`), and the open-count shown on
 * the Help & Support landing.
 *
 * Pages `GET /api/support/tickets` (src/services/support.ts). A near-copy of
 * useFavoriteRestaurants: a mounted guard, a request-id guard so a stale page
 * can't land on fresh state, the app-wide severity split (`ApiError` 4xx → warn,
 * 5xx / unreachable → reportError), and a 401 surfaced as `notSignedIn` rather
 * than an error. Opening this screen always refetches, so a ticket raised from
 * the compose flow shows up on the next visit without any client-side splicing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { listTickets, type SupportTicket } from '../services/support';

interface UseSupportTicketsResult {
  tickets: SupportTicket[];
  total: number;
  /** Tickets not yet resolved or closed — the number the landing badges. */
  openCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  isPaging: boolean;
  error: string | null;
  notSignedIn: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => void;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useSupportTickets(): UseSupportTicketsResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
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
          setTickets([]);
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
        const res = await listTickets(targetPage);
        if (!isCurrent()) return;
        setTickets((prev) => (append ? [...prev, ...res.tickets] : res.tickets));
        setTotal(res.total);
        setPages(res.pages);
        setPage(targetPage);
        loadedOnceRef.current = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('support', 'Support tickets need a signed-in customer — 401', {
            code: err.code,
          });
          if (isCurrent()) {
            setNotSignedIn(true);
            if (!append) setTickets([]);
          }
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('support', `Support tickets unavailable — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your requests.'));
        } else {
          reportError('support', 'Failed to load support tickets', err, { page: targetPage });
          if (isCurrent() && !append) setError(messageFor(err, 'Could not load your requests.'));
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

  const openCount = tickets.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  ).length;

  return {
    tickets,
    total,
    openCount,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    hasMore,
    refresh: () => fetchPage(1),
    loadMore,
  };
}
