/**
 * useLegalDocument.ts — one legal document for app/settings/legal/[doc].
 *
 * One read of `GET /api/app/legal/:docId` (src/services/appConfig.ts) for the
 * document's title, "last updated" date and its `{ heading, body }` sections.
 * Public endpoint — no auth gating. Follows the app-wide conventions: a mounted
 * guard, a request-id guard so switching documents can't land a stale response,
 * and the severity split (4xx → warn, 5xx / unreachable → reportError). A 404
 * (unknown id) is surfaced as `notFound` rather than a generic error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchLegalDocument, type LegalDocument } from '../services/appConfig';

interface UseLegalDocumentResult {
  document: LegalDocument | null;
  isLoading: boolean;
  error: string | null;
  /** The id doesn't match a known document (`terms`, `privacy`). */
  notFound: boolean;
  refresh: () => Promise<void>;
}

function messageFor(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not load this document.';
}

export function useLegalDocument(docId: string | undefined): UseLegalDocumentResult {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    if (!docId) {
      if (isCurrent()) {
        setNotFound(true);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const doc = await fetchLegalDocument(docId);
      if (!isCurrent()) return;
      setDocument(doc);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        logger.warn('legal', `Unknown legal document "${docId}"`, { code: err.code });
        if (isCurrent()) setNotFound(true);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('legal', `Legal document unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) setError(messageFor(err));
      } else {
        reportError('legal', 'Failed to load legal document', err, { docId });
        if (isCurrent()) setError(messageFor(err));
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  return { document, isLoading, error, notFound, refresh: load };
}
