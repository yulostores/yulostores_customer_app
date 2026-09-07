/**
 * favorites.ts — the customer's favorited restaurants.
 *
 *   GET    /api/users/me/favorites/restaurants   ?page=N  → { restaurants, total, page, pages }
 *   DELETE /api/users/me/favorites/restaurants/:restaurantId
 *
 * (Adding a favorite is done from the restaurant/item screens, not here.)
 *
 * Customer-token-only — the `/api/users` router is behind `authenticate`. A
 * local OTP-bypass session 401s; {@link useFavoriteRestaurants} surfaces that as
 * `notSignedIn`, the same as {@link useOrders}. Every restaurant comes back as a
 * full public document, so it goes through the shared {@link toRestaurant}
 * mapper like the home feed and the browse list.
 */

import type { PaginationMeta, Restaurant } from '../types/restaurant';
import { apiDelete, apiGet } from './api';
import { toRestaurant, type RawRestaurant } from './restaurantMapper';

interface FavoritesResponse {
  restaurants?: RawRestaurant[];
  total?: number;
  page?: number;
  pages?: number;
}

/** One page of favorited restaurants, most-recently-favorited first. */
export async function listFavoriteRestaurants(
  page = 1,
): Promise<{ restaurants: Restaurant[]; pagination: PaginationMeta }> {
  const data = await apiGet<FavoritesResponse>(
    '/api/users/me/favorites/restaurants',
    { page },
  );

  const restaurants = (data.restaurants ?? []).map((r) => toRestaurant(r));
  const resolvedPage = data.page ?? page;
  return {
    restaurants,
    pagination: {
      total: data.total ?? restaurants.length,
      page: resolvedPage,
      pages: data.pages ?? 1,
    },
  };
}

/** Un-favorite a restaurant. Resolves on success; throws `ApiError` otherwise. */
export async function removeFavoriteRestaurant(restaurantId: string): Promise<void> {
  await apiDelete<null>(`/api/users/me/favorites/restaurants/${restaurantId}`);
}
