# Release & Over-the-Air Updates

How to hand someone an installable build of the Yulo Stores customer app, and how to
push changes to it afterwards **without** rebuilding or re-sending anything.

- **Target:** Android only (a `.apk` that installs from a link — no device registration).
- **Backend:** the live DigitalOcean deployment
  `https://yulo-backend-f4juo.ondigitalocean.app` and its Managed Mongo. The build talks
  to that, not to localhost. Nobody needs to run a server.
- **Expo account:** a free one is enough for everything here.

---

## How the pieces fit

| File | Role |
|---|---|
| [`app.json`](../app.json) | Declarative native config. `runtimeVersion.policy = appVersion`, `updates` block, `version`. |
| [`app.config.js`](../app.config.js) | Thin dynamic layer over `app.json`. Injects `extra.apiUrl` (and optionally the Google Maps key) from env vars at build/update time. Locally the env vars are unset, so dev keeps auto-detecting the LAN dev server — unchanged. |
| [`eas.json`](../eas.json) | Build + update profiles. `preview` / `production` set `EXPO_PUBLIC_API_URL` to the DigitalOcean URL and build an APK for internal distribution. |
| [`src/constants/Api.ts`](../src/constants/Api.ts) | Resolves the API base URL. `extra.apiUrl` wins when set; otherwise LAN auto-detect. `src/lib/socket.ts` reuses the same base URL, so real-time order tracking follows automatically. |

`EXPO_PUBLIC_API_URL` is read on Expo's servers when a build **or** an `eas update` is
produced, so the production URL is baked into the binary and into every OTA bundle.

---

## One-time setup

Run from the repo root. `eas login` needs your Expo credentials — everything else is
automatic.

```sh
npm install --global eas-cli

eas login

# Creates the EAS project and writes extra.eas.projectId into app.json
eas init

# Writes the real updates.url (replaces the placeholder UUID in app.json)
eas update:configure

# Installs expo-updates (already in package.json) + anything else it needs
npm install
```

After this, `app.json` should have a real `extra.eas.projectId` and a real
`updates.url` of the form `https://u.expo.dev/<projectId>`. Commit those.

---

## Cut a build to share

```sh
npm run build:preview
# = eas build --profile preview --platform android
```

- Runs ~10–20 min on Expo's servers.
- Ends by printing an **install page URL + QR code**. Send that link to whoever needs the
  app; they open it on an Android phone and tap install. No Play Store, no registration.
- The same link always shows the latest `preview` build, so re-running the command and
  re-sending the *same* link also works.

`npm run build:production` is the same thing on the `production` channel (also an APK, with
an auto-incrementing Android `versionCode`). Use `preview` for day-to-day sharing.

---

## Push an update — no rebuild

For anything that lives in the JS bundle (screens, logic, styling, copy, bundled images,
even the value of `EXPO_PUBLIC_API_URL`):

```sh
npm run ota:preview -- "short description of what changed"
# = eas update --channel preview --message "short description of what changed"
```

The update uploads in seconds. Installed apps on that channel download it in the
background on next launch and **apply it on the following cold start** (fully close and
reopen). No prompt, no reinstall.

Keep the channel matched to how the build was made: `preview` build ← `ota:preview`,
`production` build ← `ota:production`.

---

## When you must rebuild instead of `eas update`

An OTA update can only replace JS/assets. It **cannot** change native code, so re-run
`npm run build:preview` and re-share when you:

- add or upgrade any `expo-*` package or `react-native` itself;
- change `permissions`, `plugins`, `icon`, `splash`, `scheme`, or `android.package` in
  `app.json` / `app.config.js`;
- bump `version` in `app.json` (this also moves `runtimeVersion`, so older installs stop
  receiving OTA updates until they install the new APK — which is the point);
- change `runtimeVersion` itself.

Everything else ships with `eas update`.

> **Why `version` matters:** `runtimeVersion.policy` is `appVersion`, so an OTA bundle is
> only delivered to builds whose `version` matches the one it was published from. Leave
> `version` alone for JS-only changes; bump it exactly when you cut a new APK for a native
> change.

---

## Known backend states (so "works like the local app" is accurate)

These are server-side and need **no** app change or rebuild to fix — flip them in the
DigitalOcean App Platform env vars when ready.

| Thing | Current state | Effect in the shared build |
|---|---|---|
| OTP | `SMS_PROVIDER=bypass` | **Any** 6-digit code signs in as the entered phone number. No SMS is sent. Fine for testing. |
| Payments | no `RAZORPAY_*` keys | Payments fall back to simulated / marked-paid. |
| Google Maps (Android) | placeholder key in `app.json` | Map views render blank. Add a real key to the `env` block of the `preview`/`production` profiles in `eas.json` as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` — `app.config.js` already reads it. The build still succeeds without it. |
| Crash reporting | `sentryDsn` is `null` | `reportError` is a no-op seam; no crashes are collected. |

Not affected by deployment: **CORS / `ALLOWED_ORIGINS`** (the native app sends no `Origin`
header, so REST and Socket.IO both connect regardless), and the **cross-site refresh
cookie** trap (the app refreshes sessions via the request body, not a browser cookie).

---

## Quick verification

1. **Dev still works:** `npm start`, open in Expo Go on the LAN — the app reaches the dev
   backend via the auto-detected host, not DigitalOcean.
2. **Prod config resolves:**
   `EXPO_PUBLIC_API_URL=https://yulo-backend-f4juo.ondigitalocean.app npx expo config --type public`
   → `extra.apiUrl` shows the DigitalOcean URL.
3. **The build:** install from the EAS link on a real phone; sign in (any 6-digit code),
   load restaurants/home/search, place an order, watch the tracking screen update live.
4. **An OTA:** change a visible string, `npm run ota:preview -- "test ota"`, close and
   reopen the app twice → the new string appears with no reinstall.
   `eas update:list` shows the published update; `Settings → About` shows the app version.
