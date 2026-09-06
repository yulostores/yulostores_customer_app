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
 *     400s with VALIDATION_ERROR "lat and lng are required". Sorted by $near,
 *     which is why it cannot also report `total`/`pages`.
 *   • with `q` → case-insensitive match on name OR cuisine. Needs no location
 *     and does return `total`/`pages`.
 *
 * Note this endpoint does NOT accept a `cuisine` filter or a `limit` — page
 * size is fixed server-side at {@link PAGE_SIZE}. (yulo_backend/API.md still
 * documents both; the controller is the authority.)
 */

import type {
  MenuCategory,
  PaginationMeta,
  Restaurant,
} from '../types/restaurant';
import { apiGet } from './api';
import { toRestaurant, type RawRestaurant } from './restaurantMapper';

/** Server-side page size — `PAGE_SIZE` in restaurant.controller.js. */
export const PAGE_SIZE = 20;

// ─── Request parameter types ───────────────────────────────────────────────

export interface ListRestaurantsParams {
  /** Free-text query, matched against name and cuisine. Switches off geo-sort. */
  q?: string;
  /** Required unless `q` is given. */
  lat?: number;
  /** Required unless `q` is given. */
  lng?: number;
  /** Geo-browse radius in km. Server default 5. */
  radius?: number;
  page?: number;
  minRating?: number;
  hasOffers?: boolean;
  vegOnly?: boolean;
}

// ─── Response types (unwrapped from envelope.data) ─────────────────────────

interface RestaurantsResponse {
  restaurants: RawRestaurant[];
  /** Absent on the geo-browse branch — $near cannot be counted. */
  total?: number;
  page: number;
  pages?: number;
}

interface RestaurantDetailResponse {
  restaurant: RawRestaurant;
}

interface MenuResponse {
  menu: MenuCategory[];
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
    radius: params?.radius,
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
      // Geo-browse sends neither: fall back to what this page proves is there,
      // and treat a full page as "there may be more".
      total: data.total ?? restaurants.length,
      page,
      pages: data.pages ?? (restaurants.length < PAGE_SIZE ? page : page + 1),
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
 * Get the full menu tree for a restaurant.
 */
export async function fetchRestaurantMenu(
  restaurantId: string,
): Promise<MenuCategory[]> {
  const data = await apiGet<MenuResponse>(
    `/api/restaurants/${restaurantId}/menu`,
  );
  return data.menu ?? [];
}
