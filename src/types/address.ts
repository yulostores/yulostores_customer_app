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
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  location?: GeoPoint;
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
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
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
  pincode?: string;
  syncPending?: boolean;
}
