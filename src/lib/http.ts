/**
 * http.ts — `fetch` with a hard timeout and an optional caller abort signal.
 *
 * Plain `fetch` in React Native never times out: a request to an unreachable
 * host can stay pending for minutes, each one holding a socket while the UI sits
 * on a spinner. `fetchWithTimeout` guarantees every call settles within its
 * budget, and tells timeout apart from a caller-initiated cancel so screens can
 * react correctly (retry vs. ignore).
 */

import { logger } from './logger';

/** Thrown when a request exceeds its time budget. `code` matches the API layer. */
export class TimeoutError extends Error {
  readonly code = 'TIMEOUT';
  constructor(
    readonly timeoutMs: number,
    /** URL or task label that timed out — for logs only. */
    readonly target: string,
  ) {
    super(`Timed out after ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

export interface FetchWithTimeoutInit extends Omit<RequestInit, 'signal'> {
  /** Abort (and reject with {@link TimeoutError}) after this many ms. */
  timeoutMs: number;
  /**
   * Optional caller signal — e.g. a superseded keystroke in a typeahead. It is
   * composed with the internal timeout signal: whichever fires first wins, and
   * a caller-driven abort propagates unchanged (not turned into a TimeoutError).
   */
  signal?: AbortSignal | null;
}

/** `true` when `err` is the caller's own abort (not our timeout). */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export async function fetchWithTimeout(
  url: string,
  { timeoutMs, signal, ...init }: FetchWithTimeoutInit,
): Promise<Response> {
  const controller = new AbortController();

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort);
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const startedAt = Date.now();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      logger.warn('http', 'Request aborted on timeout', { url, timeoutMs });
      throw new TimeoutError(timeoutMs, url);
    }
    if (signal?.aborted) {
      // Caller cancelled on purpose — surface it as-is, no logging noise.
      throw err;
    }
    // Genuine transport failure (DNS, refused, TLS, offline…).
    logger.warn('http', 'Request failed before a response', {
      url,
      elapsedMs: Date.now() - startedAt,
      cause: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Run any promise against a wall-clock deadline. For work that has no
 * `AbortSignal` hook of its own (the on-device geocoder, a GPS fix) — the
 * underlying task keeps running but the caller stops waiting on it.
 */
export function withDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.warn('http', 'Task exceeded its deadline', { label, timeoutMs });
      reject(new TimeoutError(timeoutMs, label));
    }, timeoutMs);

    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
