/**
 * auth.ts — Customer OTP login against the Yulo backend
 *
 * Endpoints (see yulo_backend/API.md → "Public — Auth"):
 *   POST /api/auth/customer/otp/send    { phone }
 *   POST /api/auth/customer/otp/verify  { phone, code, tosAccepted, guestToken? }
 *   POST /api/auth/customer/guest       {}
 *
 * The server is currently running `SMS_PROVIDER=bypass`, so `verify` accepts any
 * 6-digit code and still returns a real access token. When {@link AUTH_OTP_BYPASS}
 * is on, this module additionally tolerates the backend being unreachable and
 * hands back a local session so the trial build can always get past login.
 *
 * `requestGuestSession` starts an anonymous browsing session (real access/refresh
 * tokens, `role: 'guest'`) — the "Continue as guest" button on sign-in.tsx. A guest
 * can browse, use the cart and favorite things; the backend rejects checkout/orders/
 * reviews/support for it (401 GUEST_ACCOUNT_REQUIRED), which every screen already
 * renders as "sign in to continue". Passing that guest session's REFRESH token (its
 * access token is only good for 15 minutes — too short a fuse for "browse a while,
 * then decide to sign in") as `guestToken` into `verifyOtp` lets the backend upgrade
 * it in place — or merge it into an existing account — instead of abandoning its
 * cart/favorites.
 */

import { apiUrl } from '../constants/Api';
import { AUTH_OTP_BYPASS } from '../constants/config';
import { AUTH_TIMEOUT_MS } from '../constants/network';
import { fetchWithTimeout, TimeoutError } from '../lib/http';
import { logger, reportError } from '../lib/logger';

export interface AuthUser {
  _id: string;
  phone?: string;
  name?: string;
  email?: string;
  role: string;
}

export interface OtpSendResult {
  phone: string;
  /** Backend flag: no SMS was sent, any N-digit code will verify this number. */
  otpBypass: boolean;
  /** Present only outside production when no SMS provider is configured. */
  devOtp?: string;
  /** True when the backend could not be reached and we assumed bypass locally. */
  offline: boolean;
}

export interface VerifyResult {
  user: AuthUser;
  /** Real JWT from the backend, or '' when the session was minted locally. */
  accessToken: string;
  /** Backend refresh JWT for silent re-auth, or '' for a local/bypass session. */
  refreshToken: string;
  isNewUser: boolean;
  /** True when this session did not come from a successful backend verify. */
  bypassed: boolean;
}

export class AuthError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  data?: T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: AUTH_TIMEOUT_MS,
    });
  } catch (err) {
    // Timeout, DNS failure, connection refused, TLS error, airplane mode…
    if (err instanceof TimeoutError) {
      reportError('auth', `POST ${path} timed out`, err, { timeoutMs: AUTH_TIMEOUT_MS });
      throw new AuthError('The server took too long to respond.', 'TIMEOUT', 0);
    }
    reportError('auth', `POST ${path} could not reach the server`, err);
    throw new AuthError('Could not reach the server.', 'NETWORK_ERROR', 0);
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON body — handled below */
  }

  if (!res.ok || json?.status === 'error') {
    const authErr = new AuthError(
      json?.message ?? `Request failed (${res.status})`,
      json?.code ?? 'HTTP_ERROR',
      res.status,
    );
    // 4xx here is usually a real user-facing condition (bad code, rate limit);
    // 5xx is ours. Split the severity so dev logs stay honest.
    if (res.status >= 500) reportError('auth', `POST ${path} failed`, authErr);
    else logger.warn('auth', `POST ${path} → ${res.status} ${authErr.code}`, { path, status: res.status });
    throw authErr;
  }

  return (json?.data ?? ({} as T));
}

/**
 * Request an OTP for `phone` (10 digits, no dial code).
 * Never throws while {@link AUTH_OTP_BYPASS} is on — a failed request resolves
 * to an offline bypass result instead.
 */
export async function requestOtp(phone: string): Promise<OtpSendResult> {
  try {
    const data = await postJson<{ phone?: string; otpBypass?: boolean; devOtp?: string }>(
      '/api/auth/customer/otp/send',
      { phone },
    );
    return {
      phone,
      otpBypass: Boolean(data.otpBypass),
      devOtp: data.devOtp,
      offline: false,
    };
  } catch (err) {
    if (AUTH_OTP_BYPASS) {
      logger.warn('auth', 'requestOtp fell back to offline bypass', {
        reason: err instanceof AuthError ? err.code : 'unknown',
      });
      return { phone, otpBypass: true, offline: true };
    }
    throw err;
  }
}

/**
 * Verify `code` for `phone` and return a session.
 *
 * - Backend reachable + `SMS_PROVIDER=bypass`  → real token, `bypassed: false`.
 * - Backend rejects / unreachable + bypass on  → local session, `bypassed: true`.
 * - Bypass off                                 → the backend's error propagates.
 *
 * `guestToken` is the *current* session's REFRESH token when it's a guest one —
 * pass it so the backend can carry that guest's cart/favorites/addresses over
 * instead of starting a fresh, empty customer account. Omit for an ordinary
 * sign-in (no guest session to carry over).
 */
export async function verifyOtp(
  phone: string,
  code: string,
  guestToken?: string,
): Promise<VerifyResult> {
  try {
    const data = await postJson<{
      user: AuthUser;
      accessToken: string;
      refreshToken?: string;
      isNewUser?: boolean;
    }>('/api/auth/customer/otp/verify', {
      phone,
      code,
      tosAccepted: true,
      ...(guestToken ? { guestToken } : {}),
    });
    return {
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? '',
      isNewUser: Boolean(data.isNewUser),
      bypassed: false,
    };
  } catch (err) {
    if (AUTH_OTP_BYPASS) {
      logger.warn('auth', 'verifyOtp minted a local session (backend verify failed)', {
        reason: err instanceof AuthError ? err.code : 'unknown',
      });
      return {
        user: { _id: `local:${phone}`, phone, role: 'customer' },
        accessToken: '',
        refreshToken: '',
        isNewUser: false,
        bypassed: true,
      };
    }
    throw err;
  }
}

/**
 * Start an anonymous guest session — real tokens, `role: 'guest'`, no phone/name.
 * Unlike the OTP bypass above, this always talks to the backend and never falls
 * back to a local session: a guest with no real tokens couldn't use the cart or
 * favorites, which is the whole point of guest mode. A network failure here just
 * throws, same as a failed OTP send.
 */
export async function requestGuestSession(): Promise<VerifyResult> {
  const data = await postJson<{
    user: AuthUser;
    accessToken: string;
    refreshToken?: string;
  }>('/api/auth/customer/guest', {});
  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? '',
    isNewUser: true,
    bypassed: false,
  };
}
