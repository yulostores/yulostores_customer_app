/**
 * Here.ts — HERE Location Services configuration for the map layer.
 *
 * The app renders maps with MapLibre (`@maplibre/maplibre-react-native`, a
 * Google-free native map renderer — no Play Services dependency on Android,
 * unlike react-native-maps) and points it at HERE's Raster Tile API v3 for the
 * actual imagery. `hereStyle()` returns the minimal MapLibre style object a
 * `<Map mapStyle={...}>` needs; see
 * src/components/location/MapCanvas.native.tsx and
 * src/components/tracking/TrackingMap.native.tsx for where it's consumed
 * (the `.web.tsx` siblings of both don't import this at all — MapLibre has no
 * web build).
 *
 * The key is read the same way `apiUrl` is (app.config.js → extra.hereApiKey),
 * NOT hidden as a server secret — it's inlined into the JS bundle like every
 * other EXPO_PUBLIC_ value, because a client-side map key has to be embedded in
 * the shipped app to work at all. Its safety comes from restricting it
 * (referrer/IP allow-list) on the HERE developer portal, not from keeping it
 * out of the repo.
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

/** HERE Platform API key, or '' if unset (map tiles simply won't load). */
export const HERE_API_KEY: string = typeof extra.hereApiKey === 'string' ? extra.hereApiKey : '';

/**
 * HERE Raster Tile API v3 — plain {z}/{x}/{y} PNG tiles, so any generic map
 * renderer that supports a raster tile URL template can use them (see
 * https://developer.here.com/documentation/raster-tile-api/api-reference.html).
 * `explore.day` is HERE's standard daytime street style; swap for
 * `explore.night`/`explore.satellite.day` etc. if a different look is wanted
 * later — it's a single query param, not a different integration.
 */
function hereTileUrlTemplate(): string {
  return `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=explore.day&apiKey=${HERE_API_KEY}`;
}

/**
 * The minimal MapLibre style object a `<Map mapStyle={...}>` needs to render
 * HERE tiles as its only layer. One raster source, one raster layer — MapLibre
 * doesn't care that the tiles come from HERE rather than a vector source; a
 * raster URL template is provider-agnostic.
 *
 * Built once and cached, not reconstructed per call: `HERE_API_KEY` never
 * changes at runtime, so every caller can safely share one object — several
 * callers (the drag-to-pin camera on every frame, the tracking screen on
 * every live location update) would otherwise rebuild and re-stringify an
 * identical style dozens of times a minute for no reason.
 */
let cachedStyle: StyleSpecification | null = null;

export function hereStyle(): StyleSpecification {
  if (!cachedStyle) {
    cachedStyle = {
      version: 8,
      sources: {
        here: {
          type: 'raster',
          tiles: [hereTileUrlTemplate()],
          tileSize: 256,
          attribution: '© HERE',
        },
      },
      layers: [{ id: 'here-base', type: 'raster', source: 'here' }],
    };
  }
  return cachedStyle;
}
