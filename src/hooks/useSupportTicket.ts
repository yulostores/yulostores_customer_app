/**
 * useSupportTicket.ts — one support ticket and its thread for the ticket screen
 * (`app/help/[id].tsx`).
 *
 * One read of `GET /api/support/tickets/:id` (src/services/support.ts), then
 * `sendMessage()` appends a customer follow-up via
 * `POST /api/support/tickets/:id/messages`. Same guards as the rest of the app:
 * a mounted guard, a request-id guard, the 4xx-warn / 5xx-reportError split, and
 * a 401 surfaced as `notSignedIn`.
 *
 * The send is optimistic — the message shows immediately and is rolled back if
 * the write fails — matching the app's "local intent wins, server catches up"
 * pattern (useVegFleetPreference, favourite removal).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  addTicketMessage,
  getTicket,
  type SupportTicket,
  type TicketMessage,
} from '../services/support';

interface UseSupportTicketResult {
  ticket: SupportTicket | null;
  isLoading: boolean;
  isRefreshing: boolean;
  /** A follow-up message is being sent. */
  isSending: boolean;
  error: string | null;
  notSignedIn: boolean;
  /** Set when a send failed — clears on the next attempt. */
  sendError: string | null;
  refresh: () => Promise<void>;
  /** Append a customer reply. Resolves `true` on success, `false` on failure. */
  sendMessage: (text: string) => Promise<boolean>;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useSupportTicket(id: string): UseSupportTicketResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    if (!id) {
      if (isCurrent()) {
        setError('This request could not be found.');
        setIsLoading(false);
      }
      return;
    }

    if (!hasServerToken) {
      if (isCurrent()) {
        setNotSignedIn(true);
        setError(null);
        setIsLoading(false);
        setIsRefreshing(false);
      }
      return;
    }

    setNotSignedIn(false);
    setError(null);
    if (loadedOnceRef.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const fresh = await getTicket(id);
      if (!isCurrent()) return;
      setTicket(fresh);
      loadedOnceRef.current = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('support', 'Ticket needs a signed-in customer — 401', { code: err.code });
        if (isCurrent()) setNotSignedIn(true);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('support', `Ticket unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) setError(messageFor(err, 'Could not load this request.'));
      } else {
        reportError('support', 'Failed to load support ticket', err, { id });
        if (isCurrent()) setError(messageFor(err, 'Could not load this request.'));
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [id, hasServerToken]);

  useEffect(() => {
    load();
  }, [load]);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const body = text.trim();
      if (!body || isSending) return false;

      const optimistic: TicketMessage = { from: 'you', text: body, sentAt: new Date().toISOString() };
      const snapshot = ticket;
      setTicket((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      );
      setIsSending(true);
      setSendError(null);

      try {
        const updated = await addTicketMessage(id, body);
        if (mountedRef.current) setTicket(updated);
        return true;
      } catch (err) {
        if (mountedRef.current) setTicket(snapshot); // roll back
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('support', `Could not send reply — ${err.status} ${err.code}`, {
            id,
            code: err.code,
          });
        } else {
          reportError('support', 'Failed to send support reply', err, { id });
        }
        if (mountedRef.current) {
          setSendError(messageFor(err, 'Message not sent. Try again.'));
        }
        return false;
      } finally {
        if (mountedRef.current) setIsSending(false);
      }
    },
    [id, isSending, ticket],
  );

  return {
    ticket,
    isLoading,
    isRefreshing,
    isSending,
    error,
    notSignedIn,
    sendError,
    refresh: load,
    sendMessage,
  };
}
