/**
 * restaurant.ts — Shared TypeScript types for restaurant / menu data
 *
 * Shapes match the backend API responses documented in yulo_backend/API.md:
 *   GET /api/restaurants        → Restaurant[]
 *   GET /api/restaurants/:id    → Restaurant
 *   GET /api/restaurants/:id/menu → MenuCategory[]
 */

export interface GeoLocation {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface Restaurant {
  _id: string;
  name: string;
  description?: string;
  cuisineType: string[];
  avgRating: number;
  totalRatings: number;
  priceRange?: string;
  isOpen: boolean;
  address?: Address;
  location?: GeoLocation;
  logo?: string;
  coverImage?: string;
  openingHours?: Record<string, { open: string; close: string }>;
  ownerId?: string;
  /** Public storefront phone, from the restaurant document (not the owner's login). */
  phone?: string;
  /** Owner-declared prep+handover estimate, in minutes. Detail header prefers this
   *  over the distance-derived guess the home cards use. */
  deliveryMinutes?: number;
  establishedYear?: number;
  /**
   * Cheapest available menu item, in rupees — attached by the home feed
   * (`menuService.getStartingPrices`). `null` when the restaurant has no
   * available items priced yet, in which case the card omits the line.
   */
  startingPrice?: number | null;
  /**
   * Straight-line distance from the customer's delivery location, in km.
   * Derived on the client from `location` — the feed sorts by it but does not
   * send it. Undefined when either point is unknown.
   */
  distanceKm?: number;
  /** Every dish on this restaurant's menu is vegetarian. */
  isPureVeg?: boolean;
}

export interface MenuItem {
  _id: string;
  name: string;
  description?: string;
  foodType: 'veg' | 'non_veg' | 'egg';
  sellingPrice: number;
  discountedPrice?: number;
  effectivePrice: number;
  prepTime?: number;
  ingredients?: string[];
  /** Free-form catalogue tags, e.g. `bestseller`, `highly_reordered`. */
  badges?: string[];
  image?: string;
  isAvailable: boolean;
  /** Present only when the request carried a valid customer token. */
  isFavorited?: boolean;
}

/**
 * One row of the collapsed menu on the restaurant screen — served by
 * `GET /api/restaurants/:id/menu/categories`. Carries the name and item count so
 * the section list renders with zero item data; items for a section are pulled
 * lazily from `GET /api/restaurants/:id/menu-items` when it is expanded.
 */
export interface MenuCategorySummary {
  id: string;
  name: string;
  itemCount: number;
  subCategories: { id: string; name: string }[];
}

export interface SubCategory {
  _id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuCategory {
  _id: string;
  name: string;
  subCategories: SubCategory[];
  items: MenuItem[];
}

// ─── Item detail (GET /api/items/:id) ─────────────────────────────────────

/**
 * One choice inside an {@link ItemOptionGroup}.
 *
 * `priceDelta` is the rupee amount this option adds to the item's base price —
 * the wire field is `priceDeltaMinor`, but the backend's own price maths
 * (`pricing.service.js`) adds it straight onto `effectivePrice`, so it is in
 * the same plain-rupee unit as every other price in this app.
 */
export interface ItemOption {
  _id: string;
  name: string;
  description?: string;
  priceDelta: number;
  /** Max times this single option can be taken — only >1 for `addons` groups. */
  maxQty: number;
  isDefaultSelected: boolean;
}

/**
 * A customization block on the item detail screen. `single_choice` is a radio
 * group (pick exactly one when `required`, else 0–1); `addons` is a multi-select
 * where each option carries its own quantity, bounded by `minSelect`/`maxSelect`.
 */
export interface ItemOptionGroup {
  _id: string;
  title: string;
  type: 'single_choice' | 'addons';
  required: boolean;
  minSelect: number;
  /** `null` means unlimited. Only meaningful for `addons`. */
  maxSelect: number | null;
  options: ItemOption[];
}

/** Full payload for one dish — everything the customization screen renders. */
export interface ItemDetail {
  _id: string;
  restaurantId: string;
  name: string;
  description?: string;
  image?: string;
  foodType: MenuItem['foodType'];
  sellingPrice: number;
  discountedPrice?: number;
  effectivePrice: number;
  prepTime?: number;
  ingredients: string[];
  /** Free-form catalogue tags, e.g. `highly_reordered`, `bestseller`. */
  badges: string[];
  isAvailable: boolean;
  /** Present only when the request carried a valid customer token. */
  isFavorited?: boolean;
  category: { _id: string; name: string } | null;
  restaurant: { _id: string; name: string; cuisineTypes: string[] } | null;
  optionGroups: ItemOptionGroup[];
}

/** Pagination metadata returned by list endpoints */
export interface PaginationMeta {
  total: number;
  page: number;
  pages: number;
}

/**
 * A "What's on your mind?" card.
 *
 * Normally one of the platform's curated quick-filter chips, served by the home
 * feed with its own Cloudinary icon (QuickFilterChip collection, seeded via
 * scripts/seedQuickFilterChips.js). When the feed sends no chips we fall back to
 * cuisines derived from the nearby restaurants, borrowing a restaurant image.
 */
export interface CuisineCard {
  name: string;
  image?: string;
  /** Search term this card filters by — the chip's `queryParam`, or its name. */
  queryParam: string;
}

/** Featured promotional offer for the home banner, when one is running. */
export interface HomeBanner {
  discountId: string;
  restaurantId: string;
  offerName: string;
  code?: string;
  image?: string;
  type?: string;
  percentage?: number;
  flatAmount?: number;
}

/** Featured menu item card for "Recommended for you" */
export interface RecommendedItem {
  menuItem: MenuItem;
  /**
   * The restaurant this item belongs to, when it is among the ones the feed
   * sent. Optional so an item is still shown (minus its rating badge) rather
   * than silently dropped if the pairing ever fails.
   */
  restaurant?: Restaurant;
}
