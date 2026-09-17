/**
 * mapLibre.ts — is MapLibre's native code actually inside this binary?
 *
 * `@maplibre/maplibre-react-native` is a native module. Its JS entry calls
 * `TurboModuleRegistry.getEnforcing('MLRN…Module')` the moment it is evaluated,
 * which THROWS if the running APK/IPA was built before the package was added.
 * That situation is reachable in production: OTA updates (expo-updates) ship JS
 * only, so a bundle that imports MapLibre can land on a binary that predates
 * it. Because expo-router evaluates every screen of a stack when the stack's
 * layout mounts, that throw took down the whole `app/location/*` flow — the
 * root ErrorBoundary replaced the app with a blank grey canvas.
 *
 * Callers (MapCanvas.native.tsx, TrackingMap.native.tsx) must check this
 * before `require`-ing anything from the MapLibre package, and render their
 * static fallback when it returns false.
 */

import { TurboModuleRegistry, type TurboModule } from 'react-native';
import { logger } from './logger';

/** The native modules MapLibre's JS requires at load time for the components we use. */
const REQUIRED_MODULES = ['MLRNMapViewModule', 'MLRNCameraModule'] as const;

let linked: boolean | null = null;

export function isMapLibreLinked(): boolean {
  if (linked === null) {
    const missing = REQUIRED_MODULES.filter((name) => TurboModuleRegistry.get<TurboModule>(name) == null);
    linked = missing.length === 0;
    if (!linked) {
      logger.warn('map', 'MapLibre native modules missing from this binary — showing map fallback', {
        missing,
      });
    }
  }
  return linked;
}
