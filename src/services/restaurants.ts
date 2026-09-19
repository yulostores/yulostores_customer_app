/**
 * restaurants.ts — Restaurant & menu data fetchers
 *
 * Endpoints (see yulo_backend/server/routes/restaurant.routes.js):
 *   GET /api/restaurants           → geo-browse OR text search
 *   GET /api/restaurants/:id       → single restaurant detail
 *   GET /api/restaurants/:id/menu  → full menu tree
 *
 * The list endpoint has two mutually exclusive modes, decided by whether `q` is
 * present (`listRestaurants` in restaurant.controller.js):
 *
 *   • no `q` → geo-browse. `lat`/`lng` are REQUIRED; without them the server
 *     400s with VALIDATION_ERROR "lat and lng are required". Lists only the
 *     restaurants whose own delivery zone covers that point, nearest first, and
 *     reports `hasMore` instead of `total`/`pages`.
 *   • with `q` → case-insensitive match on restaurant name, cuisine, OR the name
 *     of an available dish the restaurant serves. With `lat`/`lng` it is scoped
 *     to the same delivery zones (nearest first, `hasMore`); without them it is
 *     unscoped and returns `total`/`pages`.
 *
 * Neither mode takes a radius — delivery reach is each restaurant's own setting,
 * decided server-side. Nor a `cuisine` filter or a `limit` — page size is fixed
 * server-side at {@link PAGE_SIZE}.
 */

import type {
  MenuCategory,
  MenuCategorySummary,
  MenuItem,
  PaginationMeta,
  Restaurant,
} from '../types/restaurant';
import { apiGet } from './api';
import {
  toMenuItem,
  toRestaurant,
  type RawMenuItem,
  type RawRestaurant,
} from './restaurantMapper';

/** Server-side page size — `PAGE_SIZE` in restaurant.controller.js. */
export const PAGE_SIZE = 20;

// ─── Request parameter types ───────────────────────────────────────────────

export interface ListRestaurantsParams {
  /** Free-text query, matched against name and cuisine. Geo-sorted and delivery-scoped
   *  only when `lat`/`lng` come with it. */
  q?: string;
  /** Required unless `q` is given. */
  lat?: number;
  /** Required unless `q` is given. */
  lng?: number;
  page?: number;
  minRating?: number;
  hasOffers?: boolean;
  vegOnly?: boolean;
}

// ─── Response types (unwrapped from envelope.data) ─────────────────────────

interface RestaurantsResponse {
  restaurants: RawRestaurant[];
  /** Absent on the geo-scoped branches — the geo scan isn't counted. */
  total?: number;
  page: number;
  pages?: number;
  /** Sent instead of `total`/`pages` on the geo-scoped branches: is there another page? */
  hasMore?: boolean;
}

interface RestaurantDetailResponse {
  restaurant: RawRestaurant;
}

interface MenuResponse {
  menu: MenuCategory[];
}

interface MenuCategoriesResponse {
  categories: MenuCategorySummary[];
}

interface MenuItemsResponse {
  items: RawMenuItem[];
  total: number;
  page: number;
  pages: number;
}

interface MenuSearchResponse {
  items: RawMenuItem[];
}

interface RawReview {
  _id: string;
  userId?: { name?: string | null; profilePicture?: string | null } | null;
  rating?: number;
  comment?: string | null;
  createdAt?: string | null;
}

interface ReviewsResponse {
  reviews?: RawReview[];
  total?: number;
  page?: number;
}

/** One customer review on a restaurant's storefront. */
export interface RestaurantReview {
  id: string;
  userName: string;
  userAvatar: string | null;
  rating: number;
  comment: string;
  createdAt: string | null;
}

function toReview(raw: RawReview): RestaurantReview {
  return {
    id: String(raw._id),
    userName: raw.userId?.name?.trim() || 'Yulo customer',
    userAvatar: raw.userId?.profilePicture?.trim() || null,
    rating: typeof raw.rating === 'number' ? raw.rating : 0,
    comment: raw.comment?.trim() || '',
    createdAt: raw.createdAt ?? null,
  };
}

/** Filters for one page of {@link fetchMenuItemsPage}. */
export interface MenuItemsParams {
  /** Restrict to one category. Omit for the whole menu. */
  categoryId?: string;
  subCategoryId?: string;
  /** `'all'` is sent as no filter. */
  foodType?: 'all' | 'veg' | 'non_veg' | 'egg';
  page?: number;
  /** Server default 10, clamped 1–30. */
  limit?: number;
}

// ─── Fetchers ──────────────────────────────────────────────────────────────

/**
 * List restaurants — geo-browse, or text search when `q` is set.
 *
 * `distanceKm` is filled in only for the geo-browse mode, where the caller's
 * `lat`/`lng` give it a reference point.
 */
export async function fetchRestaurants(
  params?: ListRestaurantsParams,
): Promise<{ restaurants: Restaurant[]; pagination: PaginationMeta }> {
  const query = params?.q?.trim();

  const data = await apiGet<RestaurantsResponse>('/api/restaurants', {
    q: query || undefined,
    lat: params?.lat,
    lng: params?.lng,
    page: params?.page,
    minRating: params?.minRating,
    // The server compares these against the literal string 'true', so send them
    // only when set — an omitted flag and `false` mean the same thing to it.
    hasOffers: params?.hasOffers ? 'true' : undefined,
    vegOnly: params?.vegOnly ? 'true' : undefined,
  });

  const raw = data.restaurants ?? [];
  const from =
    params?.lat !== undefined && params?.lng !== undefined
      ? { lat: params.lat, lng: params.lng }
      : undefined;
  const restaurants = raw.map((r) => toRestaurant(r, from));

  const page = data.page ?? 1;
  return {
    restaurants,
    pagination: {
      // Geo-scoped requests send neither: fall back to what this page proves is there.
      total: data.total ?? restaurants.length,
      page,
      // `hasMore` is exact. Older backends sent nothing, so a full page was the only hint.
      pages:
        data.pages ??
        ((data.hasMore ?? restaurants.length >= PAGE_SIZE) ? page + 1 : page),
    },
  };
}

/**
 * Get a single restaurant by ID.
 */
export async function fetchRestaurant(id: string): Promise<Restaurant> {
  const data = await apiGet<RestaurantDetailResponse>(`/api/restaurants/${id}`);
  return toRestaurant(data.restaurant);
}

/**
 * Get the full menu tree for a restaurant — the whole payload in one call.
 * The customer restaurant screen uses {@link fetchMenuCategories} +
 * {@link fetchMenuItemsPage} instead so the menu loads lazily; this stays for
 * the owner-style "everything at once" callers.
 */
export async function fetchRestaurantMenu(
  restaurantId: string,
): Promise<MenuCategory[]> {
  const data = await apiGet<MenuResponse>(
    `/api/restaurants/${restaurantId}/menu`,
  );
  return data.menu ?? [];
}

/**
 * The collapsed section list for the restaurant screen — one lightweight row per
 * category (name + item count + subcategory names), no item data. Pair with
 * {@link fetchMenuItemsPage} to fill a section in when it is expanded.
 */
export async function fetchMenuCategories(
  restaurantId: string,
): Promise<MenuCategorySummary[]> {
  const data = await apiGet<MenuCategoriesResponse>(
    `/api/restaurants/${restaurantId}/menu/categories`,
  );
  return data.categories ?? [];
}

/**
 * One page of available menu items — the lazy-load feed behind each expanded
 * category on the restaurant screen. `foodType: 'all'` is sent as no filter.
 */
export async function fetchMenuItemsPage(
  restaurantId: string,
  params: MenuItemsParams = {},
): Promise<{ items: MenuItem[]; pagination: PaginationMeta }> {
  const data = await apiGet<MenuItemsResponse>(
    `/api/restaurants/${restaurantId}/menu-items`,
    {
      categoryId: params.categoryId,
      subCategoryId: params.subCategoryId,
      foodType:
        params.foodType && params.foodType !== 'all' ? params.foodType : undefined,
      page: params.page,
      limit: params.limit,
    },
  );

  return {
    items: (data.items ?? []).map(toMenuItem),
    pagination: {
      total: data.total ?? 0,
      page: data.page ?? params.page ?? 1,
      pages: data.pages ?? 1,
    },
  };
}

/**
 * Menu-scoped text search ("Search in menu" bar). Returns a flat list — the
 * backend matches name and description against the query.
 *
 * `foodType` mirrors the diet filter the storefront screen is on (Veg Mode forces
 * `'veg'`), so this bar is filtered server-side like the rest of the menu rather
 * than in the client. `'all'` / undefined is sent as no filter.
 */
export async function fetchMenuSearch(
  restaurantId: string,
  q: string,
  foodType?: 'all' | 'veg' | 'non_veg' | 'egg',
): Promise<MenuItem[]> {
  const data = await apiGet<MenuSearchResponse>(
    `/api/restaurants/${restaurantId}/menu/search`,
    { q, foodType: foodType && foodType !== 'all' ? foodType : undefined },
  );
  return (data.items ?? []).map(toMenuItem);
}

/**
 * One page (20) of a restaurant's reviews, newest first
 * (`GET /api/restaurants/:id/reviews`, public — no auth required).
 */
export async function fetchRestaurantReviews(
  restaurantId: string,
  page = 1,
): Promise<{ reviews: RestaurantReview[]; total: number; page: number }> {
  const data = await apiGet<ReviewsResponse>(`/api/restaurants/${restaurantId}/reviews`, { page });
  return {
    reviews: (data.reviews ?? []).map(toReview),
    total: data.total ?? 0,
    page: data.page ?? page,
  };
}
