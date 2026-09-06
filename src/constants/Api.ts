/**
 * Api.ts — Dynamic API base-URL resolution
 *
 * Priority chain (first truthy value wins):
 *
 *  1. app.json  extra.apiUrl  (set this before running `eas build` for a
 *     production APK — e.g. "https://api.yulostores.in")
 *
 *  2. Expo dev-server host  (Constants.expoConfig?.hostUri contains the LAN
 *     IP + Metro port injected by the bundler at runtime, e.g. "192.168.1.5:8081").
 *     We strip the Metro port and attach the backend port instead so the app
 *     reaches the Express server on the same machine — automatically, no matter
 *     which IP the dev machine happens to have that day.
 *
 *  3. Android emulator loopback  10.0.2.2  (the emulator's alias for the host
 *     machine's localhost).
 *
 *  4. Hard-coded localhost  (only reachable from the iOS Simulator or a web
 *     browser on the same machine — never from a physical device).
 *
 * For development the backend defaults to port 3000 (see yulo_backend/server/config/env.js).
 * Override by setting  extra.apiPort  in app.json.
 */

import Constants from 'expo-constants';

// --------------------------------------------------------------------------
// Configuration read from app.json → extra
// --------------------------------------------------------------------------
const extra = Constants.expoConfig?.extra ?? {};

/** Fully-qualified production URL, e.g. "https://api.yulostores.in" */
const STATIC_API_URL: string | undefined = extra.apiUrl;

/** Backend port used in development.  Defaults to 3000. */
const API_PORT: number = Number(extra.apiPort ?? 3000) || 3000;

// --------------------------------------------------------------------------
// Derive the host IP from the Expo bundler manifest (dev builds only)
// --------------------------------------------------------------------------

/**
 * hostUri looks like "192.168.1.42:8081" in Expo Go / local dev.
 * It is undefined in standalone / bare production builds.
 */
const hostUri: string | undefined =
  Constants.expoConfig?.hostUri ??
  // Legacy field kept for older Expo Go versions
  (Constants as any).manifest?.debuggerHost;

/**
 * Extract only the IP / hostname part, dropping the Metro port.
 *  "192.168.1.42:8081"  →  "192.168.1.42"
 *  "[::1]:8081"         →  "[::1]"          (IPv6, unlikely but safe)
 */
function extractHost(uri: string): string {
  // IPv6 addresses are wrapped in brackets, e.g. "[::1]:8081"
  if (uri.startsWith('[')) {
    const closeBracket = uri.indexOf(']');
    return uri.slice(0, closeBracket + 1);
  }
  // IPv4 / hostname — everything before the last colon
  const colon = uri.lastIndexOf(':');
  return colon !== -1 ? uri.slice(0, colon) : uri;
}

// --------------------------------------------------------------------------
// Resolve the final base URL
// --------------------------------------------------------------------------
function resolveBaseUrl(): string {
  // 1️⃣  Static production URL from app config. Guard the type — a stale bundle
  //      or a mis-typed extra.apiUrl (number, object, bool) must not crash the
  //      whole app on `.replace`.
  if (typeof STATIC_API_URL === 'string' && STATIC_API_URL.trim()) {
    return STATIC_API_URL.trim().replace(/\/$/, ''); // strip trailing slash
  }

  // 2️⃣  LAN IP detected from the Expo dev server
  if (typeof hostUri === 'string' && hostUri) {
    const host = extractHost(hostUri);
    return `http://${host}:${API_PORT}`;
  }

  // 3️⃣  Android emulator → host machine localhost alias
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  // 4️⃣  Last resort (iOS Simulator / web)
  return `http://localhost:${API_PORT}`;
}

// --------------------------------------------------------------------------
// Public exports
// --------------------------------------------------------------------------

/** Base URL for all API calls, e.g. "http://192.168.1.42:3000" */
export const API_BASE_URL = resolveBaseUrl();

/** Convenience helper — returns a full endpoint URL */
export function apiUrl(path: string): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalised}`;
}
