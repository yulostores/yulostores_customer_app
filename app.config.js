/**
 * app.config.js — dynamic layer over app.json
 * ------------------------------------------------------------------
 * Expo reads app.json first, then calls this function with it as `config`.
 * Everything declarative still lives in app.json; this file only injects the
 * handful of values that must change between environments, sourced from
 * `process.env` (set per-profile in eas.json → build.<profile>.env).
 *
 *   Local `expo start`      — no env vars set → values fall back to app.json,
 *                             so `extra.apiUrl` stays null and src/constants/Api.ts
 *                             keeps auto-detecting the dev-server host on the LAN.
 *                             Today's workflow is unchanged.
 *   `eas build` / `eas update` — the profile's env is present, so the production
 *                             API URL is baked into the binary AND every OTA bundle.
 *
 * Anything prefixed EXPO_PUBLIC_ is also inlined into the JS bundle by Metro, but
 * we route it through `extra` here so there is a single source of truth that
 * expo-constants can read at runtime (see src/constants/Api.ts, src/lib/crashReporter.ts).
 */

module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl || null;
  // HERE Location Services key — used client-side for map tiles (src/constants/Here.ts).
  // Same "inlined into the bundle" caveat as everything else EXPO_PUBLIC_: this is not a
  // server secret, it's a client-embedded key, so it must be restricted (referrer/IP) on
  // the HERE portal side rather than protected by keeping it out of the repo.
  const hereApiKey = process.env.EXPO_PUBLIC_HERE_API_KEY || config.extra?.hereApiKey || null;

  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl,
      hereApiKey,
    },
  };
};
