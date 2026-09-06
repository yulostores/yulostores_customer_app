/**
 * search.ts — the Search tab's discovery data (Recent + Popular).
 *
 * Endpoints (yulo_backend/server/routes/search.routes.js):
 *   GET    /api/search/popular?vegOnly=  → public; [{ query, imageUrl }]
 *   GET    /api/search/recent            → customer token; newest-first history
 *   POST   /api/search/recent            → record a term (best-effort)
 *   DELETE /api/search/recent/:id        → drop one row
 *
 * Every call goes through src/services/api.ts, which already enforces the request
 * timeout ({@link API_TIMEOUT_MS}), unwraps the `{ status, data }` envelope, and
 * logs each failure once with the app-wide severity split (5xx / unreachable →
 * reportError, expected 4xx → warn). This module only reshapes the wire payload
 * into the view types in src/types/search.ts.
 */

import { apiDelete, apiGet, apiPost } from './api';
import type { PopularSearch, RecentSearch } from '../types/search';

interface RawPopular {
  popular?: { query?: string | null; imageUrl?: string | null }[];
}

interface RawRecent {
  recent?: { _id?: string; query?: string | null }[];
}

/**
 * "Popular right now" tiles. `vegOnly` mirrors the app-wide VEG Only switch — the
 * backend swaps its curated seed list for the veg variant. Entries without a
 * usable `query` are dropped; a missing image stays `undefined` so the tile can
 * render its own placeholder rather than a broken `<Image>`.
 */
export async function fetchPopularSearches(vegOnly: boolean): Promise<PopularSearch[]> {
  const data = await apiGet<RawPopular>('/api/search/popular', {
    // The server compares this against the literal string 'true' — send it only
    // when on, same convention as `vegOnly` in restaurants.ts.
    vegOnly: vegOnly ? 'true' : undefined,
  });
  return (data.popular ?? [])
    .map((p) => ({
      query: (p.query ?? '').trim(),
      imageUrl: p.imageUrl ?? undefined,
    }))
    .filter((p) => p.query.length > 0);
}

/**
 * The signed-in customer's recent searches, newest first. Only call this with a
 * real session — the endpoint 401s otherwise, which api.ts surfaces as an
 * ApiError the caller is expected to treat as "just hide the section".
 */
export async function fetchRecentSearches(): Promise<RecentSearch[]> {
  const data = await apiGet<RawRecent>('/api/search/recent');
  return (data.recent ?? [])
    .map((r) => ({ id: r._id ?? '', query: (r.query ?? '').trim() }))
    .filter((r) => r.id.length > 0 && r.query.length > 0);
}

/**
 * Record a term the customer actually searched. Best-effort: a failure here must
 * never interrupt the search itself, so the caller ignores rejections (api.ts
 * has already logged it). No-ops for a blank term; the POST 401s for a
 * signed-out caller, which the caller swallows.
 */
export async function recordSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  await apiPost('/api/search/recent', { query: trimmed });
}

/** Remove one recent-search row by id. */
export async function removeRecentSearch(id: string): Promise<void> {
  await apiDelete(`/api/search/recent/${id}`);
}
