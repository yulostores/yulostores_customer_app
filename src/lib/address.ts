/**
 * address.ts — turn what the picker gathered into a backend address payload.
 *
 * Shape and semantics per yulo_backend/API.md → "Add Saved Address":
 *  - `street` is one free-text line; we compose it from the flat/floor/landmark
 *    inputs, falling back to the reverse-geocoded street.
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
    place?.street ||
    place?.title ||
    undefined;

  const payload: AddressPayload = {
    label: form.label,
    street: streetLine,
    city: place?.city,
    state: place?.region,
    pincode: place?.pincode,
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
