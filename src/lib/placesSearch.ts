/**
 * placesSearch.ts — free-text place search for the "search an address" screen.
 *
 * Uses OpenStreetMap Nominatim directly (same provider the backend geocodes
 * with — see yulo_backend/server/services/geocode.service.js). No key, no
 * billing. Nominatim asks callers to send an identifying User-Agent and keep
 * volume light; a debounced search box is well within that.
 *
 * There is no first-party autocomplete endpoint on the Yulo API, so this is the
 * client-side stand-in until a Places provider is wired in.
 */

import { PLACES_TIMEOUT_MS } from '../constants/network';
import { fetchWithTimeout, isAbortError, TimeoutError } from './http';
import { logger } from './logger';
import type { LatLng } from '../types/address';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'YuloStoresCustomerApp/1.0 (address search)';

export interface PlaceSuggestion {
  id: string;
  /** Bold line — a name or street. */
  primary: string;
  /** Grey line — locality, city, state, pincode. */
  secondary: string;
  coordinates: LatLng;
  street?: string;
  city?: string;
  region?: string;
  pincode?: string;
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

const pick = (a: Record<string, string> | undefined, keys: string[]) => {
  if (!a) return undefined;
  for (const k of keys) if (a[k]) return a[k];
  return undefined;
};

/**
 * Look up `query`. Pass `near` to softly bias results around a point (the map
 * centre / the user's location). Returns `[]` for a blank or too-short query,
 * and on any network / parse failure — the caller shows an empty state either
 * way. Pass an `AbortSignal` so a superseded keystroke's request is dropped.
 */
export async function searchPlaces(
  query: string,
  opts: { near?: LatLng; signal?: AbortSignal } = {},
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(NOMINATIM);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'in');

  if (opts.near) {
    const { latitude: lat, longitude: lng } = opts.near;
    const d = 0.75; // ~80 km soft bias box
    url.searchParams.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`);
    url.searchParams.set('bounded', '0');
  }

  let items: NominatimItem[];
  try {
    const res = await fetchWithTimeout(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: opts.signal,
      timeoutMs: PLACES_TIMEOUT_MS,
    });
    if (!res.ok) {
      logger.warn('places', 'Nominatim search returned a non-OK status', {
        status: res.status,
        query: q,
      });
      return [];
    }
    items = (await res.json()) as NominatimItem[];
  } catch (err) {
    // A superseded keystroke aborting its request is expected — stay quiet.
    if (isAbortError(err) && !(err instanceof TimeoutError)) return [];
    logger.warn('places', 'Nominatim search failed — showing no suggestions', {
      query: q,
      reason: err instanceof TimeoutError ? 'timeout' : err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  if (!Array.isArray(items)) {
    logger.warn('places', 'Nominatim search returned an unexpected body shape', { query: q });
    return [];
  }

  return items.map((it) => {
    const a = it.address;
    const street = pick(a, ['road', 'pedestrian', 'footway', 'neighbourhood']);
    const houseNo = a?.house_number;
    const locality = pick(a, ['suburb', 'neighbourhood', 'village', 'town', 'city_district']);
    const city = pick(a, ['city', 'town', 'village', 'municipality', 'county']);
    const region = a?.state;
    const pincode = a?.postcode;

    const streetLine = [houseNo, street].filter(Boolean).join(' ');
    const primary = it.name || streetLine || it.display_name.split(',')[0];
    const secondary =
      [streetLine && streetLine !== primary ? streetLine : null, locality, city, region, pincode]
        .filter(Boolean)
        .join(', ') || it.display_name.split(',').slice(1, 4).join(',').trim();

    return {
      id: String(it.place_id),
      primary,
      secondary,
      coordinates: { latitude: Number(it.lat), longitude: Number(it.lon) },
      street: streetLine || street || undefined,
      city: city || undefined,
      region: region || undefined,
      pincode: pincode || undefined,
    };
  });
}
