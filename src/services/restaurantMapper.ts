/**
 * restaurantMapper.ts — the one translation between a wire restaurant and the
 * `Restaurant` view type every screen renders.
 *
 * The backend returns Restaurant documents essentially as stored (see
 * yulo_backend/server/models/Restaurant.js): cuisines live on `cuisineTypes`,
 * the hero image on `bannerImage`, and opening state is only derivable from an
 * `operatingHours` array of HHMM integers — there is no `isOpen` field on the
 * wire. `src/types/restaurant.ts` names all three differently, so anything that
 * hands a raw document to a screen crashes on the first `cuisineType.join()`.
 *
 * Every fetcher that returns restaurants goes through {@link toRestaurant} so
 * that mismatch is fixed in exactly one place — the home feed and the
 * restaurant list/detail endpoints all speak this same document shape.
 */

import { haversineKm } from '../lib/geo';
import type { Restaurant } from '../types/restaurant';

/** The fields we read off a wire restaurant. Everything is optional but `_id`/`name`. */
export interface RawRestaurant {
  _id: string;
  name: string;
  description?: string;
  cuisineTypes?: string[];
  avgRating?: number;
  totalRatings?: number;
  priceRange?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
  address?: { street?: string; city?: string; state?: string; pincode?: string };
  logo?: string;
  bannerImage?: string;
  coverImage?: string;
  ownerId?: string;
  startingPrice?: number | null;
  isPureVeg?: boolean;
  operatingHours?: {
    day: string;
    isOpen: boolean;
    openTime: number;
    closeTime: number;
  }[];
}

const WEEKDAY = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * `operatingHours` stores each bound as an HHMM integer (900 → 09:00,
 * 2200 → 22:00). No entry for today, or one flagged closed, means closed.
 */
export function isOpenNow(hours: RawRestaurant['operatingHours']): boolean {
  if (!hours?.length) return false;
  const now = new Date();
  const today = hours.find((h) => h.day === WEEKDAY[now.getDay()]);
  if (!today?.isOpen) return false;
  const hhmm = now.getHours() * 100 + now.getMinutes();
  return hhmm >= today.openTime && hhmm <= today.closeTime;
}

/**
 * Reshape one wire restaurant into the view type.
 *
 * @param from  the customer's location, when known — only then can `distanceKm`
 *              be derived. Endpoints that aren't geo-scoped (text search) pass
 *              nothing and the field stays undefined, which cards already treat
 *              as "distance unknown".
 */
export function toRestaurant(
  r: RawRestaurant,
  from?: { lat: number; lng: number },
): Restaurant {
  // `location.coordinates` is GeoJSON — [lng, lat], not [lat, lng].
  const coords = r.location?.coordinates;
  const distanceKm =
    from && coords && coords.length === 2
      ? haversineKm(
          { latitude: from.lat, longitude: from.lng },
          { latitude: coords[1], longitude: coords[0] },
        )
      : undefined;

  return {
    _id: r._id,
    name: r.name,
    description: r.description,
    cuisineType: r.cuisineTypes ?? [],
    avgRating: r.avgRating ?? 0,
    totalRatings: r.totalRatings ?? 0,
    priceRange: r.priceRange,
    isOpen: isOpenNow(r.operatingHours),
    address: r.address,
    location: r.location,
    logo: r.logo,
    // The home feed sends `bannerImage`; the restaurant documents the list and
    // detail endpoints return carry both, and older rows only `coverImage`.
    coverImage: r.bannerImage ?? r.coverImage,
    ownerId: r.ownerId,
    startingPrice: r.startingPrice ?? null,
    isPureVeg: r.isPureVeg ?? false,
    distanceKm,
  };
}
