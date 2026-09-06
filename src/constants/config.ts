/**
 * Auth / OTP configuration
 * ------------------------------------------------------------------
 * Every tunable that the login flow depends on lives here — nothing in the
 * screens or services is hard-coded. Change behaviour by editing this file.
 */

/**
 * TRIAL MODE — bypass real OTP verification.
 *
 * While `true`, the app signs a customer in with ANY {@link OTP_LENGTH}-digit
 * code:
 *
 *   1. It still calls the real backend first
 *      (`POST /api/auth/customer/otp/send` + `.../verify`). The server is
 *      currently running with `SMS_PROVIDER=bypass` (the MessageCentral balance
 *      is exhausted), which already accepts any code and returns a real token —
 *      so on the happy path the app gets a genuine session.
 *
 *   2. If any of those calls fail (server down, no network, OTP store
 *      unavailable, rate-limited…), the app falls back to a local session so
 *      testing is never blocked.
 *
 * Flip this to `false` once MessageCentral is topped up and the server is back
 * on `SMS_PROVIDER=messagecentral`. Real OTP verification is then enforced and
 * a wrong code is rejected.
 */
export const AUTH_OTP_BYPASS = true;

/**
 * Number of digits in the OTP. Must match the backend, which validates
 * `code` with `z.string().length(6)` (see auth.routes.js).
 */
export const OTP_LENGTH = 6;

/**
 * Digits in the national phone number. The backend validates `phone` with
 * `/^\d{10}$/` (see auth.routes.js).
 */
export const PHONE_NUMBER_LENGTH = 10;

/** Dial code shown as a fixed prefix in front of the phone number. */
export const DEFAULT_DIAL_CODE = '+91';

/** Seconds before the "Resend code" action becomes tappable again. */
export const OTP_RESEND_SECONDS = 30;
