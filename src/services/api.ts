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
import { API_TIMEOUT_MS } from '../constants/network';
import { fetchWithTimeout, TimeoutError } from '../lib/http';
import { logger, reportError } from '../lib/logger';
import { getAccessToken } from './session';

// ─── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// ─── Response envelope ─────────────────────────────────────────────────────

interface Envelope<T> {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  data?: T;
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method: 'GET', headers, timeoutMs: API_TIMEOUT_MS });
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
    );
    logApiFailure('GET', path, apiErr);
    throw apiErr;
  }

  return (json?.data ?? ({} as T));
}

// ─── Mutating helper (POST / PATCH / PUT / DELETE) ─────────────────────────

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Perform an authenticated request with an optional JSON body.
 * Returns the unwrapped `data` from the response envelope.
 *
 * Shares {@link apiGet}'s contract: `ApiError('NETWORK_ERROR', 0)` when the
 * server is unreachable, `ApiError('TIMEOUT', 0)` when it is too slow, and
 * `ApiError(code, status)` for an error envelope.
 */
export async function apiSend<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      timeoutMs: API_TIMEOUT_MS,
    });
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
    );
    logApiFailure(method, path, apiErr);
    throw apiErr;
  }

  return (json?.data ?? ({} as T));
}

export const apiPost = <T>(path: string, body?: unknown) => apiSend<T>('POST', path, body);
export const apiPatch = <T>(path: string, body?: unknown) => apiSend<T>('PATCH', path, body);
export const apiDelete = <T>(path: string, body?: unknown) => apiSend<T>('DELETE', path, body);
