/**
 * placesSearch.ts — free-text place search for the "search an address" screen.
 *
 * Now a thin adapter over src/services/geo.ts, which calls HERE Geocoding & Search through our
 * own backend. It used to hit OpenStreetMap Nominatim directly from the device; that was keyless
 * and free, but it is materially worse at exactly the addresses this app needs — apartment
 * complexes, tower names, local landmarks and anything a customer would actually type in an
 * Indian city. It was also a second, unrelated provider sitting next to the HERE tiles the map
 * already renders, which meant the pin a customer picked and the map they picked it on came from
 * two different sources.
 *
 * The public shape is unchanged: a suggestion still carries `coordinates`, so the search screen's
 * tap handler works exactly as before. The one API change is that `signal` is gone — requests now
 * go through the shared API client, which owns its own timeout, so a superseded keystroke is
 * handled by ignoring its late answer rather than by aborting it in flight.
 */

import { searchPlaces as searchPlacesRemote, type PlaceSuggestion } from '../services/geo';
import type { LatLng } from '../types/address';

export type { PlaceSuggestion };

/**
 * Look up `query`, anchored on `near` (the map centre or the user's location).
 *
 * `near` is required rather than a bias hint: HERE's autosuggest has no unanchored mode. Returns
 * `[]` for a query under three characters and on any failure — the caller shows an empty state
 * either way.
 */
export async function searchPlaces(
  query: string,
  opts: { near: LatLng },
): Promise<PlaceSuggestion[]> {
  return searchPlacesRemote(query, opts);
}
