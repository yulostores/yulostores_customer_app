/**
 * Address / location types.
 *
 * Shapes mirror the backend exactly (see yulo_backend/API.md "Add Saved Address"
 * and server/models/User.js `addressSchema`) so a payload built in the app maps
 * 1:1 onto `POST /api/users/me/addresses`.
 */

/** Plain lat/lng, the order every map + geocoder API on the client uses. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * GeoJSON point — `coordinates` is [longitude, latitude] (GeoJSON order), which
 * is the reverse of `LatLng`. This is what the backend stores and expects.
 */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export type AddressLabel = 'home' | 'work' | 'other';

/**
 * One entry in `user.savedAddresses` as returned by the API. `location` is
 * absent when the server could not geocode a text-only address.
 */
export interface SavedAddress {
  _id: string;
  label: AddressLabel;
  customLabel?: string | null;
  /** Flat / house / block number — the line a rider reads at the door. */
  houseNumber?: string | null;
  floor?: string | null;
  /** Building / apartment / society name. */
  building?: string | null;
  landmark?: string | null;
  /** Locality / neighbourhood / sector, between the street and the city. */
  area?: string | null;
  /**
   * The composed one-line form, built server-side from the parts above plus the geocoded
   * street. Still the field to render when only one line fits — it is also what every
   * order placed before the parts existed carries.
   */
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string | null;
  formattedAddress?: string | null;
  location?: GeoPoint;
  locationSource?: 'device' | 'map_pin' | 'geocoded' | 'unknown';
  contactName?: string | null;
  contactPhone?: string | null;
  isDefault?: boolean;
}

/**
 * Request body for creating / updating a saved address. Every field is optional
 * on the wire; we always send `location.coordinates` because the flow always has
 * a real map/GPS fix by the time we save (API.md: "a GPS reading beats anything
 * a geocoder can infer from a text line" — it is used as-is).
 */
export interface AddressPayload {
  label: AddressLabel;
  customLabel?: string;
  /**
   * The parts, sent as their own fields. They used to be joined into `street` with commas
   * before being sent, which meant the server stored one opaque line: the rider could not
   * tell the flat number from the landmark, and the edit screen could not repopulate the
   * form it had just collected. `street` is composed server-side from these.
   */
  houseNumber?: string;
  floor?: string;
  building?: string;
  landmark?: string;
  area?: string;
  /** Only the geocoded road/street line — the flat number belongs in `houseNumber`. */
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  formattedAddress?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
}

/**
 * A reverse-geocoded place — the human-readable address the map picker resolves
 * for the pin's current position. Kept flat and provider-agnostic.
 */
export interface ResolvedPlace {
  /** Bold first line, e.g. a building / street name. */
  title: string;
  /** Grey second line: locality, city, region, pincode. */
  subtitle: string;
  street?: string;
  district?: string;
  city?: string;
  region?: string; // state
  pincode?: string;
  country?: string;
}

/**
 * Everything the picker gathers before the details form. Carried between the
 * map screen and the confirm screen.
 */
export interface LocationDraft {
  coordinates: LatLng;
  place: ResolvedPlace | null;
}

/**
 * The delivery location the rest of the app reads. Either a persisted
 * `SavedAddress` (has `_id`) or an ad-hoc pin the user confirmed but did not
 * save. `syncPending` marks a draft that could not reach the backend yet
 * (e.g. the customer is not signed in).
 */
export interface ActiveLocation {
  id: string | null;
  label: AddressLabel;
  customLabel?: string | null;
  /** One-line address for the "Deliver to" bar. */
  line: string;
  /** Locality / city line under it. */
  sublocality?: string;
  coordinates: LatLng;
  /**
   * True when this address has no usable map point, so `coordinates` is a placeholder
   * rather than where the customer is. Every geo-scoped screen must check this before
   * using `coordinates` — an unplaceable address used to silently become New Delhi (or
   * `{latitude: undefined}`, which quietly stopped the home feed fetching at all).
   */
  unlocated?: boolean;
  pincode?: string;
  syncPending?: boolean;
}
