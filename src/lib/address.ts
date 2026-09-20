/**
 * address.ts — turn what the picker gathered into a backend address payload.
 *
 * Shape and semantics per yulo_backend/API.md → "Add Saved Address":
 *  - Every part the customer typed is sent as its OWN field: `houseNumber`, `floor`,
 *    `building`, `landmark`. They used to be comma-joined into `street` here, which
 *    threw the structure away at the last possible moment — the server stored one
 *    opaque line, a rider could not tell the flat number from the landmark, and the
 *    edit screen could not repopulate the form that had just collected them.
 *  - `street` now carries only the geocoded road line. The server composes the
 *    one-line display form from all of the parts and stores that back into `street`,
 *    so anything rendering a single line is unaffected.
 *  - `area`, `city`, `state`, `pincode` are pre-filled from the reverse geocode
 *    (ResolvedPlace) and shown as individually editable chips on the confirm screen.
 *  - `location.coordinates` is GeoJSON [lng, lat] and is ALWAYS sent here — the
 *    flow only ever reaches this point with a real map/GPS fix, which the server
 *    uses as-is rather than re-geocoding the text.
 *  - `customLabel` is only meaningful when `label === 'other'`.
 */

import { toGeoJSON } from './geo';
import type { AddressLabel, AddressPayload, LatLng, ResolvedPlace } from '../types/address';

export interface AddressForm {
  house: string; // flat / house / block no.
  floor?: string;
  building?: string;
  landmark?: string;
  label: AddressLabel;
  customLabel?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  // Individually corrected sub-fields (override reverse-geocode values)
  area?: string;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const clean = (s?: string | null) => s?.trim() || undefined;

export function buildAddressPayload(
  coordinates: LatLng,
  place: ResolvedPlace | null,
  form: AddressForm,
): AddressPayload {
  const payload: AddressPayload = {
    label: form.label,
    // Each part its own field. `street` is the ROAD only — the flat number, floor and
    // landmark are no longer folded into it, so the server can keep them apart and the
    // edit screen can read them back.
    houseNumber: clean(form.house),
    floor: clean(form.floor),
    building: clean(form.building),
    landmark: clean(form.landmark),
    area: clean(form.area) ?? place?.district,
    street: clean(form.street) ?? place?.street ?? place?.title,
    city: clean(form.city) ?? place?.city,
    state: clean(form.state) ?? place?.region,
    pincode: clean(form.pincode) ?? place?.pincode,
    country: place?.country,
    // The provider's own rendering of the pin, kept verbatim alongside the parsed parts —
    // the tiebreaker when the two disagree about where the customer actually pointed.
    formattedAddress: place ? [place.title, place.subtitle].filter(Boolean).join(', ') : undefined,
    location: { type: 'Point', coordinates: toGeoJSON(coordinates) },
  };

  if (form.label === 'other' && clean(form.customLabel)) {
    payload.customLabel = clean(form.customLabel);
  }
  if (clean(form.contactName)) payload.contactName = clean(form.contactName);
  if (clean(form.contactPhone)) payload.contactPhone = clean(form.contactPhone);
  if (form.isDefault) payload.isDefault = true;

  // Drop the keys nothing filled in, so the request never carries a bare `undefined` the
  // server would have to decide how to interpret.
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  ) as AddressPayload;
}

/** One-line summary for confirmation UI. */
export function summarisePlace(place: ResolvedPlace | null): { title: string; subtitle: string } {
  if (!place) return { title: 'Pinned location', subtitle: 'Address details not detected' };
  return { title: place.title, subtitle: place.subtitle };
}

/**
 * Format a SavedAddress for display in lists.
 * Returns a single-line string with all non-empty parts joined.
 *
 * `street` is already the server-composed line (flat, building, floor, landmark, road), so
 * the parts are not repeated here — doing so would print the flat number twice.
 */
export function formatSavedAddress(parts: {
  street?: string;
  area?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
}): string {
  return [parts.street, parts.area, parts.city, parts.state, parts.pincode]
    .filter(Boolean)
    .join(', ');
}

/**
 * Whether a saved address has a point the app can actually use.
 *
 * Deliberately not a truthiness check on `location`. An address whose geocode failed can
 * come back as `{ type: 'Point', coordinates: [] }` — truthy, correctly typed, and empty —
 * which the app used to turn into `{ latitude: undefined, longitude: undefined }` and then
 * cache as the active delivery location. The home feed needs `lat`/`lng` and simply never
 * fetched, so the customer sat on a "choose a location" prompt with a location already
 * chosen, with no way out but to add another address.
 */
export function hasUsablePoint(address: {
  location?: { coordinates?: number[] } | null;
}): boolean {
  const c = address.location?.coordinates;
  return Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(n));
}
