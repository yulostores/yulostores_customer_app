/**
 * network.ts — timeouts for every outbound request.
 *
 * React Native's `fetch` has NO timeout of its own: a call to a dead or slow
 * host stays pending until the OS gives up (often 60-120 s), and each one holds
 * a socket and leaves whatever screen triggered it stuck in its loading state.
 * Every external call in this app goes through a helper that enforces one of
 * these budgets so failures are fast, visible, and recoverable.
 *
 * Values are deliberately generous — tuned for a mobile connection on the slow
 * side of usable. Override per call with the `timeoutMs` option where an
 * endpoint is legitimately slower.
 */

/** First-party Yulo API (same region, expected to be quick). */
export const API_TIMEOUT_MS = 12_000;

/** Auth / OTP endpoints — an SMS-gateway round-trip can sit behind these. */
export const AUTH_TIMEOUT_MS = 15_000;

/** On-device reverse geocoding (Android Geocoder / iOS CLGeocoder), the fallback path in
 *  src/lib/geo.ts. Place search and the primary reverse geocode both go through /api/geo/* now,
 *  so they run on the shared API client's timeout rather than one of their own. */
export const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

/** Acquiring a fresh GPS fix. */
export const LOCATION_FIX_TIMEOUT_MS = 12_000;
