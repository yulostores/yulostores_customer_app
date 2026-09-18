/**
 * geo.ts — device location + reverse geocoding for the address flow.
 *
 * Reverse geocoding runs on-device via `expo-location` (Android's Geocoder /
 * iOS CLGeocoder) — no API key, works in Expo Go. It can return nothing on some
 * devices / offline, so every caller must handle a `null` place.
 *
 * The backend stores points as GeoJSON `[longitude, latitude]`; every map and
 * geocoder here speaks `{ latitude, longitude }`. `toGeoJSON` / `fromGeoJSON`
 * are the only place that order is flipped.
 */

import * as Location from 'expo-location';
import { LOCATION_FIX_TIMEOUT_MS, REVERSE_GEOCODE_TIMEOUT_MS } from '../constants/network';
import { reverseGeocode as reverseGeocodeRemote } from '../services/geo';
import { TimeoutError, withDeadline } from './http';
import { logger } from './logger';
import type { LatLng, ResolvedPlace } from '../types/address';

/** Fallback centre when we have no permission and no last-known fix. */
export const DEFAULT_REGION: LatLng = { latitude: 28.6139, longitude: 77.209 }; // New Delhi
export const DEFAULT_ZOOM = 16.5;

export class LocationError extends Error {
  code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT';
  constructor(code: LocationError['code'], message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

// ─── Permissions ───────────────────────────────────────────────────────────

export async function getForegroundPermissionStatus() {
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  return { granted: status === 'granted', canAskAgain };
}

/** Prompts if not yet decided. Returns whether we ended up with permission. */
export async function ensureForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.status === 'granted';
}

// ─── Position ──────────────────────────────────────────────────────────────

/**
 * Current device position. Tries a cached fix first (instant) and falls back to
 * a fresh read. Throws {@link LocationError} on denied permission / no fix.
 */
export async function getCurrentCoordinates(): Promise<LatLng> {
  const granted = await ensureForegroundPermission();
  if (!granted) {
    throw new LocationError('PERMISSION_DENIED', 'Location permission was not granted.');
  }

  const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch((err) => {
    logger.warn('geo', 'getLastKnownPositionAsync failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  if (cached) {
    return { latitude: cached.coords.latitude, longitude: cached.coords.longitude };
  }

  // `getCurrentPositionAsync` can sit for a very long time when there is no
  // signal — cap the wait so callers can fall back instead of hanging.
  try {
    const fresh = await withDeadline(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_FIX_TIMEOUT_MS,
      'getCurrentPositionAsync',
    );
    return { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
  } catch (err) {
    const timedOut = err instanceof TimeoutError;
    logger.warn('geo', timedOut ? 'GPS fix timed out' : 'GPS fix failed', {
      reason: timedOut ? `>${LOCATION_FIX_TIMEOUT_MS}ms` : err instanceof Error ? err.message : String(err),
    });
    throw new LocationError(
      timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
      'Could not get a location fix. Try again outdoors.',
    );
  }
}

// ─── Reverse geocoding ─────────────────────────────────────────────────────

const dedupeJoin = (parts: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw?.trim();
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(', ');
};

/**
 * Human-readable address for a coordinate, or `null` when nothing resolves.
 *
 * Tries the backend's HERE-backed reverse geocoder first and falls back to the on-device one.
 * The order matters: the device geocoder is free and works offline, but it is noticeably worse at
 * Indian addresses — it routinely answers a precise pin with a bare pincode or a road two blocks
 * away, which is what makes a drag-to-pin flow feel untrustworthy. HERE goes first for quality;
 * the device stays as the safety net for when the backend or the network is unreachable.
 *
 * Using HERE here also keeps the customer's pin and the restaurant's pin on the same provider
 * (the backend geocodes restaurants through HERE too), so delivery-radius maths compares like
 * with like.
 */
export async function reverseGeocode(coords: LatLng): Promise<ResolvedPlace | null> {
  const remote = await reverseGeocodeRemote(coords);
  if (remote) {
    return {
      title: remote.title,
      subtitle: remote.subtitle,
      street: remote.street,
      district: remote.district,
      city: remote.city,
      region: remote.region,
      pincode: remote.pincode,
      country: remote.country,
    };
  }
  return reverseGeocodeOnDevice(coords);
}

/**
 * On-device reverse geocoding (Android Geocoder / iOS CLGeocoder). No API key and works offline,
 * but see {@link reverseGeocode} for why it is the fallback rather than the primary.
 */
async function reverseGeocodeOnDevice(coords: LatLng): Promise<ResolvedPlace | null> {
  let hit: Location.LocationGeocodedAddress | undefined;
  try {
    [hit] = await withDeadline(
      Location.reverseGeocodeAsync(coords),
      REVERSE_GEOCODE_TIMEOUT_MS,
      'reverseGeocodeAsync',
    );
  } catch (err) {
    logger.warn('geo', 'Reverse geocode failed — returning no place', {
      reason:
        err instanceof TimeoutError
          ? `>${REVERSE_GEOCODE_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err),
    });
    return null;
  }
  if (!hit) return null;

  const streetLine = dedupeJoin([hit.streetNumber, hit.street]);
  const locality = hit.district ?? hit.subregion ?? undefined;

  // `name` is a short POI/building name on iOS but often the whole formatted
  // line on Android — only use it as the title when it's genuinely short.
  const nameIsShort = hit.name && hit.name.length <= 32 && !hit.name.includes(',');
  const title =
    (nameIsShort ? hit.name : undefined) ||
    streetLine ||
    locality ||
    hit.city ||
    'Dropped pin';

  const subtitle = dedupeJoin([
    title === streetLine ? undefined : streetLine,
    locality,
    hit.city,
    hit.region,
    hit.postalCode,
  ]);

  return {
    title,
    subtitle: subtitle || hit.region || hit.country || '',
    street: streetLine || hit.name || undefined,
    district: locality,
    city: hit.city ?? undefined,
    region: hit.region ?? undefined,
    pincode: hit.postalCode ?? undefined,
    country: hit.country ?? undefined,
  };
}

// ─── GeoJSON <-> LatLng ────────────────────────────────────────────────────

export const toGeoJSON = ({ latitude, longitude }: LatLng): [number, number] => [
  longitude,
  latitude,
];

export const fromGeoJSON = ([longitude, latitude]: [number, number]): LatLng => ({
  latitude,
  longitude,
});

// ─── Distance ──────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres between two points.
 *
 * The home feed sorts by distance server-side but never sends the value, and
 * the restaurant cards need it to render "2.4 km". Straight-line rather than
 * road distance — the same approximation Mongo's `$near` uses to build the
 * ordering these cards are shown in, so the number always agrees with the sort.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ─── Bearing ───────────────────────────────────────────────────────────────

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Initial compass bearing from `a` to `b`, in degrees clockwise from north (0-360).
 *
 * Rotates the rider marker on the tracking map so it points the way the rider is travelling — one
 * of the small details that separates a live-feeling map from a dot that slides around. Used only
 * when the device's own heading is unavailable: a stationary GPS fix reports no heading, but two
 * consecutive pings still say which way the rider went.
 *
 * This is the forward azimuth of the great-circle path. Over the few hundred metres between two
 * pings that is indistinguishable from a straight line, but the formula costs nothing extra and
 * avoids the distortion a flat approximation picks up away from the equator.
 */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  // atan2 returns -180..180; the modulo brings it into the 0..360 the map expects.
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
