/**
 * api.ts — Reusable API client for authenticated requests
 *
 * Wraps `fetch` with:
 *  - A hard request timeout ({@link API_TIMEOUT_MS}) so a slow or dead backend
 *    can never wedge a screen on its spinner — see src/lib/http.ts
 *  - The standard Yulo response envelope (`{ status, data }`)
 *  - Automatic Bearer token from session
 *  - Typed error handling: every failure is an {@link ApiError} carrying a
 *    machine-readable `code` (`NETWORK_ERROR` | `TIMEOUT` | `HTTP_ERROR` | the
 *    server's own code) and the HTTP `status` (0 when no response arrived)
 *  - One structured log line per failure for developers (never shown to users)
 */

import { apiUrl } from '../constants/Api';
import { API_TIMEOUT_MS, AUTH_TIMEOUT_MS } from '../constants/network';
import { fetchWithTimeout, TimeoutError } from '../lib/http';
import { logger, reportError } from '../lib/logger';
import { reconnectSocketIfActive } from '../lib/socket';
import { getAccessToken, getSession, setAccessToken, setSession } from './session';

// ─── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  code: string;
  status: number;
  /** The server's `details` payload, when it sent one (e.g. `{ items: [...] }`
   *  on `CART_PRICE_CHANGED` / `ORDER_ITEM_UNAVAILABLE`, `{ field }` on
   *  validation errors). `null` for transport failures. */
  details: unknown;
  constructor(message: string, code: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ─── Response envelope ─────────────────────────────────────────────────────

interface Envelope<T> {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  data?: T;
  /** Present on error responses that carry structured context (validation
   *  field, changed-price / unavailable line items, …). */
  details?: unknown;
}

// ─── Shared failure logging ────────────────────────────────────────────────

/**
 * One place decides how loud a failure is: a timeout, an unreachable server, or
 * a 5xx is a real `error` a developer should see; an expected 4xx (401 on a
 * bypass session, 422 validation) is a `warn`. Users never see any of this —
 * callers still surface `ApiError.message`.
 */
function logApiFailure(method: string, path: string, err: ApiError): void {
  const context = { method, path, code: err.code, status: err.status };
  if (err.status === 0 || err.status >= 500) {
    reportError('api', `${method} ${path} failed`, err, context);
  } else {
    logger.warn('api', `${method} ${path} → ${err.status} ${err.code}`, context);
  }
}

/** Turn any thrown value from the fetch/parse step into a typed ApiError. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof TimeoutError) {
    return new ApiError('The server took too long to respond.', 'TIMEOUT', 0);
  }
  return new ApiError('Could not reach the server.', 'NETWORK_ERROR', 0);
}

// ─── Silent token refresh ──────────────────────────────────────────────────

/** A single in-flight refresh, shared by every 401 that lands while it runs — a
 *  screenful of parallel requests triggers exactly one `/auth/refresh`. */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchange the stored refresh token for a fresh access token. Resolves `true`
 * when the session was rotated (and the socket reconnected with the new token),
 * `false` on any failure or when there is no refresh token to spend (a bypass /
 * offline session).
 */
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const session = getSession();
  if (!session?.refreshToken) return false;

  try {
    // Bare fetch, not apiSend: this call must not re-enter the 401 path, and it
    // needs no Bearer header. `?portal=customer` scopes it to the customer
    // refresh secret on the backend.
    const res = await fetchWithTimeout(apiUrl('/api/auth/refresh?portal=customer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      timeoutMs: AUTH_TIMEOUT_MS,
    });

    let json: Envelope<{ accessToken?: string }> | null = null;
    try {
      json = (await res.json()) as Envelope<{ accessToken?: string }>;
    } catch {
      /* non-JSON body — treated as a failed refresh below */
    }

    if (!res.ok || json?.status !== 'success' || !json?.data?.accessToken) {
      logger.warn('api', 'Session refresh rejected', { status: res.status, code: json?.code });
      return false;
    }

    setAccessToken(json.data.accessToken);
    // Real-time events authenticate with the token captured at handshake time —
    // re-handshake an in-use socket with the rotated one (no-op if none is open).
    reconnectSocketIfActive();
    return true;
  } catch (err) {
    logger.warn('api', 'Session refresh failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Issue an authenticated request and, on a 401 for a real (non-bypass) session,
 * rotate the access token once via {@link refreshAccessToken} and replay it —
 * `buildHeaders` is re-invoked so the replay carries the new token. A 401 that
 * survives the refresh (or a session with no refresh token) means the session
 * is unrecoverable: it is cleared so the router falls back to the sign-in stack,
 * and the still-401 response is returned for the normal envelope handling.
 */
async function fetchAuthed(
  method: string,
  url: string,
  buildHeaders: () => Record<string, string>,
  body?: string | FormData,
): Promise<Response> {
  const send = () =>
    fetchWithTimeout(url, { method, headers: buildHeaders(), body, timeoutMs: API_TIMEOUT_MS });

  let res = await send();
  if (res.status !== 401) return res;

  // Bypass / offline sessions carry no refresh token — a 401 there is expected
  // (see logApiFailure); leave it for the caller and never force a sign-out.
  if (!getSession()?.refreshToken) return res;

  if (await refreshAccessToken()) {
    res = await send();
    if (res.status !== 401) return res;
  }

  setSession(null);
  return res;
}

// ─── GET helper ────────────────────────────────────────────────────────────

/**
 * Perform an authenticated GET request.
 * Returns the unwrapped `data` from the response envelope.
 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  // Build query string from params, skipping undefined values
  let url = apiUrl(path);
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  let res: Response;
  try {
    res = await fetchAuthed('GET', url, buildHeaders);
  } catch (err) {
    const apiErr = toApiError(err);
    logApiFailure('GET', path, apiErr);
    throw apiErr;
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON body — handled below */
  }

  if (!res.ok || json?.status === 'error') {
    const apiErr = new ApiError(
      json?.message ?? `Request failed (${res.status})`,
      json?.code ?? 'HTTP_ERROR',
      res.status,
      json?.details ?? null,
    );
    logApiFailure('GET', path, apiErr);
    throw apiErr;
  }

  return (json?.data ?? ({} as T));
}

// ─── Mutating helper (POST / PATCH / PUT / DELETE) ─────────────────────────

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Per-call options for {@link apiSend} / {@link apiPost}. `headers` is merged in
 *  last so a caller can add e.g. an `Idempotency-Key`, but never override
 *  `Authorization`. */
export interface SendOptions {
  headers?: Record<string, string>;
}

/**
 * Perform an authenticated request with an optional body.
 * Returns the unwrapped `data` from the response envelope.
 *
 * The body is JSON-encoded unless it is a `FormData` instance, in which case it
 * is passed through untouched and the `Content-Type` header is left unset so the
 * platform's `fetch` can add the `multipart/form-data` boundary itself (the one
 * multipart caller today is the avatar upload in `PATCH /api/users/me`).
 *
 * Shares {@link apiGet}'s contract: `ApiError('NETWORK_ERROR', 0)` when the
 * server is unreachable, `ApiError('TIMEOUT', 0)` when it is too slow, and
 * `ApiError(code, status)` for an error envelope.
 */
export async function apiSend<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts?: SendOptions,
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    // Let `fetch` set `Content-Type` (with its boundary) for a multipart body.
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Caller-supplied headers last so an Idempotency-Key (etc.) can't be dropped,
    // but Authorization / Content-Type stay under this client's control.
    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v;
      }
    }
    return headers;
  };

  const payload =
    body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body);

  let res: Response;
  try {
    res = await fetchAuthed(method, apiUrl(path), buildHeaders, payload);
  } catch (err) {
    const apiErr = toApiError(err);
    logApiFailure(method, path, apiErr);
    throw apiErr;
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON body (e.g. 204) — handled below */
  }

  if (!res.ok || json?.status === 'error') {
    const apiErr = new ApiError(
      json?.message ?? `Request failed (${res.status})`,
      json?.code ?? 'HTTP_ERROR',
      res.status,
      json?.details ?? null,
    );
    logApiFailure(method, path, apiErr);
    throw apiErr;
  }

  return (json?.data ?? ({} as T));
}

export const apiPost = <T>(path: string, body?: unknown, opts?: SendOptions) =>
  apiSend<T>('POST', path, body, opts);
export const apiPatch = <T>(path: string, body?: unknown) => apiSend<T>('PATCH', path, body);
export const apiDelete = <T>(path: string, body?: unknown) => apiSend<T>('DELETE', path, body);
