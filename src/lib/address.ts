/**
 * address.ts — turn what the picker gathered into a backend address payload.
 *
 * Shape and semantics per yulo_backend/API.md → "Add Saved Address":
 *  - `street` is one free-text line; we compose it from the flat/floor/landmark
 *    inputs, falling back to the reverse-geocoded street.
 *  - `city`, `state`, `pincode` are stored as separate fields — they are pre-filled
 *    from the reverse geocode (ResolvedPlace) and shown as individually editable
 *    chips on the confirm screen. The caller overrides them after calling this
 *    function if the user has corrected them.
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
  landmark?: string;
  label: AddressLabel;
  customLabel?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  // Individually corrected sub-fields (override reverse-geocode values)
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const clean = (s?: string) => s?.trim() || undefined;

export function buildAddressPayload(
  coordinates: LatLng,
  place: ResolvedPlace | null,
  form: AddressForm,
): AddressPayload {
  const streetLine =
    [clean(form.house), form.floor?.trim() ? `Floor ${form.floor.trim()}` : undefined, clean(form.landmark)]
      .filter(Boolean)
      .join(', ') ||
    clean(form.street) ||
    place?.street ||
    place?.title ||
    undefined;

  const payload: AddressPayload = {
    label: form.label,
    // Each of these is stored as a separate DB column — NOT collapsed into street
    street: streetLine,
    city: clean(form.city) ?? place?.city,
    state: clean(form.state) ?? place?.region,
    pincode: clean(form.pincode) ?? place?.pincode,
    location: { type: 'Point', coordinates: toGeoJSON(coordinates) },
  };

  if (form.label === 'other' && clean(form.customLabel)) {
    payload.customLabel = clean(form.customLabel);
  }
  if (clean(form.contactName)) payload.contactName = clean(form.contactName);
  if (clean(form.contactPhone)) payload.contactPhone = clean(form.contactPhone);
  if (form.isDefault) payload.isDefault = true;

  return payload;
}

/** One-line summary for confirmation UI. */
export function summarisePlace(place: ResolvedPlace | null): { title: string; subtitle: string } {
  if (!place) return { title: 'Pinned location', subtitle: 'Address details not detected' };
  return { title: place.title, subtitle: place.subtitle };
}

/**
 * Format a SavedAddress for display in lists.
 * Returns a single-line string with all non-empty parts joined.
 */
export function formatSavedAddress(parts: {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): string {
  return [parts.street, parts.city, parts.state, parts.pincode].filter(Boolean).join(', ');
}
