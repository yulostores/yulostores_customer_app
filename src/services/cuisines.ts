/**
 * cuisines.ts — the full cuisine list for the "Browse by cuisine" screen.
 *
 * One route: `GET /api/cuisines` (public, cached 15 min server-side). Derived
 * live from restaurants' `cuisineTypes` — no icon/id, just a name and how many
 * restaurants carry it, sorted by that count.
 */

import { apiGet } from './api';

export interface Cuisine {
  name: string;
  restaurantCount: number;
}

interface RawCuisine {
  name?: string;
  restaurantCount?: number;
}

interface CuisinesResponse {
  cuisines?: RawCuisine[];
}

export async function fetchCuisines(): Promise<Cuisine[]> {
  const data = await apiGet<CuisinesResponse>('/api/cuisines');
  return (data.cuisines ?? [])
    .map((c) => ({
      name: c.name?.trim() ?? '',
      restaurantCount: typeof c.restaurantCount === 'number' ? c.restaurantCount : 0,
    }))
    .filter((c) => c.name.length > 0);
}
