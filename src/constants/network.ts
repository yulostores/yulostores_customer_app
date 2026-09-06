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

/** Third-party place search (OpenStreetMap Nominatim) — only feeds a typeahead. */
export const PLACES_TIMEOUT_MS = 8_000;

/** On-device reverse geocoding (Android Geocoder / iOS CLGeocoder). */
export const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

/** Acquiring a fresh GPS fix. */
export const LOCATION_FIX_TIMEOUT_MS = 12_000;
