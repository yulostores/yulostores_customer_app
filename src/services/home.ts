/**
 * home.ts — the Home screen's single data source.
 *
 * One call to `GET /api/home/feed?lat=&lng=` returns everything the
 * Home sections need — restaurants that deliver to the location (geo-sorted; each
 * restaurant's own delivery zone decides, the app sends no radius), the same set re-sorted
 * by rating, a handful of recommended items, the curated quick-filter chips and
 * the featured offer banner — all built server-side in one round-trip
 * (see yulo_backend/server/services/home.service.js).
 *
 * The backend speaks a richer, differently-named shape than the screen renders
 * (`cuisineTypes` vs `cuisineType`, `bannerImage` vs `coverImage`, chips as
 * `{ label, iconUrl, queryParam }`, a flat `recommendedItems` array carrying
 * only `restaurantId`). This module reshapes the payload into the view types in
 * `src/types/restaurant.ts` — restaurants via the shared `restaurantMapper`,
 * everything feed-specific here; nothing downstream knows the wire format.
 */

import { apiGet } from './api';
import { toRestaurant, type RawRestaurant } from './restaurantMapper';
import type {
  CuisineCard,
  HomeBanner,
  MenuItem,
  RecommendedItem,
  Restaurant,
} from '../types/restaurant';

// ─── Raw backend payload (only the fields we read) ─────────────────────────

/**
 * The feed sends the same restaurant document shape as every other endpoint —
 * see {@link RawRestaurant} in restaurantMapper.ts, which is also where it is
 * reshaped into the view type.
 */
type RawFeedRestaurant = RawRestaurant;

interface RawFeedMenuItem {
  _id: string;
  restaurantId: string;
  name: string;
  description?: string;
  foodType?: MenuItem['foodType'];
  sellingPrice?: number;
  discountedPrice?: number | null;
  prepTime?: number;
  ingredients?: string[];
  image?: string;
  isAvailable?: boolean;
}

interface RawQuickFilterChip {
  label: string;
  iconUrl?: string | null;
  queryParam?: string;
}

interface RawHomeBanner {
  discountId: string;
  restaurantId: string;
  offerName: string;
  code?: string;
  image?: string | null;
  type?: string;
  percentage?: number;
  flatAmount?: number;
}

interface RawHomeFeed {
  nearbyRestaurants?: RawFeedRestaurant[];
  recommendedRestaurants?: RawFeedRestaurant[];
  recommendedItems?: RawFeedMenuItem[];
  quickFilterChips?: RawQuickFilterChip[];
  banner?: RawHomeBanner | null;
  /** Set by the backend only when `vegMode` was on for this request. */
  vegBannerText?: string | null;
}

/** Recommended-restaurants row shows a curated few, not the whole nearby list. */
const RECOMMENDED_RESTAURANTS_LIMIT = 10;

/**
 * Open restaurants first, closed ones after — each group keeping the backend's
 * nearest-first order (Array.prototype.sort is stable). A closed restaurant can't take
 * an order, so it shouldn't sit above ones that can just because it is a few hundred
 * metres nearer. Same convention as Swiggy/Zomato, which grey closed places to the bottom.
 */
function openFirst(restaurants: Restaurant[]): Restaurant[] {
  return [...restaurants].sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
}

// ─── Reshape helpers ──────────────────────────────────────────────────────

function toMenuItem(m: RawFeedMenuItem): MenuItem {
  const selling = m.sellingPrice ?? 0;
  const discounted = m.discountedPrice ?? undefined;
  return {
    _id: m._id,
    name: m.name,
    description: m.description,
    foodType: m.foodType ?? 'veg',
    sellingPrice: selling,
    discountedPrice: discounted,
    // Mirrors the backend's `effectivePrice` virtual (`discountedPrice ??
    // sellingPrice`) EXACTLY, because that virtual is what cart.service.js
    // charges. Anything cleverer here — e.g. ignoring a `discountedPrice` that
    // sits above `sellingPrice`, which some catalogue rows do have — would show
    // a price on this screen that the customer is not the one billed, and the
    // jump would only surface at checkout. Bad rows are a data problem to fix
    // in the catalogue, not something the customer app may paper over.
    effectivePrice: discounted ?? selling,
    prepTime: m.prepTime,
    ingredients: m.ingredients,
    image: m.image,
    isAvailable: m.isAvailable ?? true,
  };
}

/**
 * "What's on your mind?" — the platform's curated chips, each with its own
 * icon. This is the row's real data source; it is seeded independently of the
 * restaurants nearby, so it stays populated even in a thin delivery area.
 */
function toCuisineCards(chips: RawQuickFilterChip[]): CuisineCard[] {
  return chips
    .filter((c) => !!c.label)
    .map((c) => ({
      name: c.label,
      image: c.iconUrl ?? undefined,
      queryParam: c.queryParam ?? c.label,
    }));
}

/**
 * Fallback for the row when the feed sends no chips (an empty QuickFilterChip
 * collection, or a cache miss against an older backend): one card per distinct
 * cuisine across the nearby set, keyed to a representative restaurant image.
 */
function deriveCuisines(restaurants: Restaurant[]): CuisineCard[] {
  const seen = new Map<string, string | undefined>();
  for (const r of restaurants) {
    for (const c of r.cuisineType) {
      if (!seen.has(c)) seen.set(c, r.logo || r.coverImage);
    }
  }
  return Array.from(seen, ([name, image]) => ({ name, image, queryParam: name }));
}

function toBanner(b: RawHomeBanner | null | undefined): HomeBanner | null {
  if (!b) return null;
  return {
    discountId: b.discountId,
    restaurantId: b.restaurantId,
    offerName: b.offerName,
    code: b.code,
    image: b.image ?? undefined,
    type: b.type,
    percentage: b.percentage,
    flatAmount: b.flatAmount,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface HomeFeedData {
  cuisines: CuisineCard[];
  recommendedItems: RecommendedItem[];
  recommendedRestaurants: Restaurant[];
  nearbyRestaurants: Restaurant[];
  banner: HomeBanner | null;
  /** "Pure veg mode is on — showing only vegetarian food", when veg mode was on. */
  vegBannerText: string | null;
}

/**
 * Fetch and reshape the Home feed for a delivery location. `lat`/`lng` are
 * required by the backend (it 400s without them) — callers must not invoke this
 * until the customer has a chosen delivery location.
 *
 * `vegMode`/`vegScope` mirror the "VEG Only" switch on the screen (see
 * VegModeContext): on, the feed drops/substitutes non-veg dishes everywhere and,
 * when `vegScope` is `'pure_veg_only'`, also excludes any restaurant that isn't
 * 100% vegetarian (`home.service.js`'s `getHomeFeed`).
 */
export async function fetchHomeFeed(coords: {
  lat: number;
  lng: number;
  vegMode?: boolean;
  vegScope?: 'all_restaurants' | 'pure_veg_only';
}): Promise<HomeFeedData> {
  const feed = await apiGet<RawHomeFeed>('/api/home/feed', {
    lat: coords.lat,
    lng: coords.lng,
    // The server compares this against the literal string 'true' (home.controller.js) —
    // send it only when on, same convention as `vegOnly` in restaurants.ts.
    vegMode: coords.vegMode ? 'true' : undefined,
    vegScope: coords.vegMode ? coords.vegScope ?? 'all_restaurants' : undefined,
  });

  const nearbyRestaurants = openFirst(
    (feed.nearbyRestaurants ?? []).map((r) => toRestaurant(r, coords)),
  );
  const recommendedRestaurants = (feed.recommendedRestaurants ?? [])
    .map((r) => toRestaurant(r, coords))
    .slice(0, RECOMMENDED_RESTAURANTS_LIMIT);

  // `recommendedItems` arrives flat — pair each back to its restaurant so the
  // card can show that restaurant's rating. The backend draws these from the
  // nearby set, but index both lists and keep an unpaired item anyway: a card
  // missing its rating badge beats a silently empty row.
  const restaurantById = new Map<string, Restaurant>();
  for (const r of [...nearbyRestaurants, ...recommendedRestaurants]) {
    if (!restaurantById.has(r._id)) restaurantById.set(r._id, r);
  }
  const recommendedItems: RecommendedItem[] = (feed.recommendedItems ?? []).map(
    (raw) => ({
      menuItem: toMenuItem(raw),
      restaurant: restaurantById.get(String(raw.restaurantId)),
    }),
  );

  const chips = toCuisineCards(feed.quickFilterChips ?? []);

  return {
    cuisines: chips.length > 0 ? chips : deriveCuisines(nearbyRestaurants),
    recommendedItems,
    recommendedRestaurants,
    nearbyRestaurants,
    banner: toBanner(feed.banner),
    vegBannerText: feed.vegBannerText ?? null,
  };
}
