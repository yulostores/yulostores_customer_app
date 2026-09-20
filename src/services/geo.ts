/**
 * geo.ts — client for the backend's /api/geo/* endpoints.
 *
 * These wrap HERE Geocoding & Search plus this platform's serviceability rules. The app already
 * carries a HERE key for map tiles (src/constants/Here.ts), so this is not about hiding a
 * credential — it is about three things the device cannot do for itself:
 *
 *   - caching, so every customer watching a delivery does not each buy their own lookups;
 *   - one place to enforce India-only results and normalise HERE's several address shapes;
 *   - shared normalisation with the backend's restaurant geocoder, so a restaurant's pin and a
 *     customer's pin are never produced by two providers that disagree about where a place is.
 *
 * Every function degrades rather than throws: an address search that cannot reach the server
 * shows an empty state, and a serviceability check that fails is treated as "assume serviceable"
 * so a backend hiccup can never block someone from ordering.
 */

import { apiGet, ApiError } from './api';
import { logger } from '../lib/logger';
import type { LatLng } from '../types/address';

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * One typeahead row.
 *
 * Unlike Google Places Autocomplete, HERE returns a position inline with each suggestion, so a
 * chosen row needs no second round-trip before a pin can drop. That is why this carries
 * `coordinates` and there is no `resolvePlace` step.
 */
export interface PlaceSuggestion {
  id: string;
  /** Bold line — a place name or street. */
  primary: string;
  /** Grey line — locality, city, state, pincode. */
  secondary: string;
  coordinates: LatLng;
  street?: string;
  district?: string;
  city?: string;
  region?: string;
  pincode?: string;
}

/** A reverse-geocoded point. */
export interface ResolvedPlaceDetails {
  title: string;
  subtitle: string;
  coordinates: LatLng;
  street?: string;
  district?: string;
  city?: string;
  region?: string;
  pincode?: string;
  country?: string;
}

export interface ServiceabilityResult {
  /** At least one restaurant will DELIVER to this pin. Drives the warning on the map. */
  serviceable: boolean;
  /** How many restaurants deliver here. */
  restaurantCount: number;
  /** Distance to the closest restaurant that covers this point, in km. */
  nearestKm: number | null;
  /**
   * How many restaurants the customer will SEE here — everything inside the platform's
   * 25 km discovery radius, whether or not it delivers this far.
   *
   * The two numbers answer different questions, and conflating them is what made the
   * warning on the map misleading: "no restaurants deliver here" reads as "this is a dead
   * zone" when the truth is often "there are twelve restaurants nearby, none of which has
   * set a radius that reaches you".
   */
  browsableCount: number;
  /** Distance to the closest restaurant the customer can see, delivering or not. */
  nearestBrowsableKm: number | null;
}

// ─── Wire shapes ───────────────────────────────────────────────────────────

const fromGeoJSON = ([longitude, latitude]: [number, number]): LatLng => ({ latitude, longitude });

interface RawSuggestion extends Omit<PlaceSuggestion, 'coordinates'> {
  coordinates: [number, number];
}

interface RawPlace extends Omit<ResolvedPlaceDetails, 'coordinates'> {
  coordinates: [number, number];
}

const asQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return search.toString();
};

/** `{latitude, longitude}` → the `lng,lat` string the geo endpoints parse. */
const asPoint = (p: LatLng) => `${p.longitude},${p.latitude}`;

// ─── API ───────────────────────────────────────────────────────────────────

/**
 * Typeahead suggestions for `query`, anchored around `near`.
 *
 * `near` is required, not optional: HERE's autosuggest has no unanchored mode, so callers pass
 * the map centre or the app's default region rather than omitting it.
 *
 * Returns `[]` for a query under three characters (HERE charges for those and answers them
 * badly) and for any failure — the search box shows its empty state either way.
 */
export async function searchPlaces(
  query: string,
  opts: { near: LatLng },
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    const { suggestions } = await apiGet<{ suggestions: RawSuggestion[] }>(
      `/api/geo/autocomplete?${asQuery({ q, near: asPoint(opts.near) })}`,
    );
    if (!Array.isArray(suggestions)) return [];
    return suggestions.map(({ coordinates, ...rest }) => ({
      ...rest,
      coordinates: fromGeoJSON(coordinates),
    }));
  } catch (err) {
    logger.warn('geo', 'Place autocomplete failed — showing no suggestions', {
      query: q,
      reason: err instanceof ApiError ? err.code : String(err),
    });
    return [];
  }
}

/**
 * Server-side reverse geocoding (HERE), for the drag-to-pin map.
 *
 * Returns null when HERE has nothing or the call fails, and src/lib/geo.ts then falls back to the
 * on-device geocoder. HERE is tried first because the device geocoder is noticeably worse at
 * Indian addresses — it routinely returns a bare pincode where HERE returns a building.
 */
export async function reverseGeocode(coords: LatLng): Promise<ResolvedPlaceDetails | null> {
  try {
    const { place } = await apiGet<{ place: RawPlace | null }>(
      `/api/geo/reverse?${asQuery({ at: asPoint(coords) })}`,
    );
    return place ? { ...place, coordinates: fromGeoJSON(place.coordinates) } : null;
  } catch (err) {
    logger.warn('geo', 'Server reverse geocode failed — falling back to device geocoder', {
      reason: err instanceof ApiError ? err.code : String(err),
    });
    return null;
  }
}

/**
 * Does anything actually deliver to this pin?
 *
 * Checked before an address is saved, so the customer is warned at the map rather than
 * discovering an empty home feed afterwards. A failed check reports `serviceable: true`: this is
 * an advisory warning, and a backend hiccup must never be the reason someone cannot place an
 * order. `restaurantCount: 0` distinguishes that optimistic default from a real positive answer.
 */
export async function checkServiceability(coords: LatLng): Promise<ServiceabilityResult> {
  try {
    return await apiGet<ServiceabilityResult>(
      `/api/geo/serviceability?${asQuery({ at: asPoint(coords) })}`,
    );
  } catch (err) {
    logger.warn('geo', 'Serviceability check failed — assuming serviceable', {
      reason: err instanceof ApiError ? err.code : String(err),
    });
    return {
      serviceable: true,
      restaurantCount: 0,
      nearestKm: null,
      browsableCount: 0,
      nearestBrowsableKm: null,
    };
  }
}
