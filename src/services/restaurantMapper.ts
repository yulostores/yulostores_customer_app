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
import type { MenuItem, Restaurant } from '../types/restaurant';

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
  phone?: string;
  establishedYear?: number;
  delivery?: { estimatedMinutes?: number };
  startingPrice?: number | null;
  isPureVeg?: boolean;
  operatingHours?: {
    day: string;
    isOpen: boolean;
    openTime: number;
    closeTime: number;
  }[];
  isFavorited?: boolean;
}

/** The fields we read off a wire menu item — the raw MenuItem document plus its
 *  `effectivePrice` virtual, as returned by `/menu-items`, `/menu/search` and the
 *  home feed. */
export interface RawMenuItem {
  _id: string;
  name: string;
  description?: string;
  foodType?: MenuItem['foodType'];
  sellingPrice?: number;
  discountedPrice?: number | null;
  effectivePrice?: number;
  prepTime?: number;
  ingredients?: string[];
  badges?: string[];
  image?: string;
  isAvailable?: boolean;
  isFavorited?: boolean;
  /** Count of customization groups on the dish — attached by `/menu-items` and
   *  `/menu/search`. `> 0` means "ADD" must open the customization screen. */
  optionGroupCount?: number;
}

/**
 * Reshape one wire menu item into the view type. Mirrors the backend's
 * `effectivePrice` virtual EXACTLY (`discountedPrice ?? sellingPrice`) because
 * that virtual is what `cart.service.js` charges — see the longer note in
 * `src/services/home.ts`, whose own private copy of this predates the shared one.
 */
export function toMenuItem(m: RawMenuItem): MenuItem {
  const selling = m.sellingPrice ?? 0;
  const discounted = m.discountedPrice ?? undefined;
  return {
    _id: m._id,
    name: m.name,
    description: m.description,
    foodType: m.foodType ?? 'veg',
    sellingPrice: selling,
    discountedPrice: discounted,
    effectivePrice: m.effectivePrice ?? discounted ?? selling,
    prepTime: m.prepTime,
    ingredients: m.ingredients,
    badges: m.badges,
    image: m.image,
    isAvailable: m.isAvailable ?? true,
    isFavorited: m.isFavorited,
    optionGroupCount: m.optionGroupCount ?? 0,
  };
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
    phone: r.phone,
    // Owner-declared prep+handover estimate. The detail header prefers this over
    // the distance-derived guess the home cards fall back to.
    deliveryMinutes: r.delivery?.estimatedMinutes,
    establishedYear: r.establishedYear,
    startingPrice: r.startingPrice ?? null,
    isPureVeg: r.isPureVeg ?? false,
    distanceKm,
    isFavorited: r.isFavorited,
  };
}
