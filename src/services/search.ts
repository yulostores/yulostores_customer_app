/**
 * search.ts — the Search tab's discovery data (Recent + Popular + Typeahead).
 *
 * Endpoints (yulo_backend/server/routes/search.routes.js):
 *   GET    /api/search/typeahead?q=      → public; [{ id, name, type, thumbnailUrl, foodType }]
 *   GET    /api/search/popular?vegOnly=  → public; { popular: [{ query, imageUrl }], vegBannerText }
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
import type { PopularSearch, RecentSearch, TypeaheadResult } from '../types/search';

interface RawPopular {
  popular?: { query?: string | null; imageUrl?: string | null }[];
  /** "Pure veg mode is on — …", set only when the request asked for `vegOnly`. */
  vegBannerText?: string | null;
}

interface RawRecent {
  recent?: { _id?: string; query?: string | null }[];
}

interface RawTypeahead {
  results?: {
    id?: string;
    name?: string | null;
    type?: string | null;
    thumbnailUrl?: string | null;
    foodType?: string | null;
  }[];
}

/** "Popular right now" tiles, plus the veg-mode banner text for the same request. */
export interface PopularSearchesResult {
  popular: PopularSearch[];
  /** "Pure veg mode is on — showing only vegetarian food", when `vegOnly` was on. */
  vegBannerText: string | null;
}

/**
 * "Popular right now" tiles. `vegOnly` mirrors the app-wide VEG Only switch — the
 * backend swaps its curated seed list for the veg variant. Entries without a
 * usable `query` are dropped; a missing image stays `undefined` so the tile can
 * render its own placeholder rather than a broken `<Image>`.
 */
export async function fetchPopularSearches(vegOnly: boolean): Promise<PopularSearchesResult> {
  const data = await apiGet<RawPopular>('/api/search/popular', {
    // The server compares this against the literal string 'true' — send it only
    // when on, same convention as `vegOnly` in restaurants.ts.
    vegOnly: vegOnly ? 'true' : undefined,
  });
  const popular = (data.popular ?? [])
    .map((p) => ({
      query: (p.query ?? '').trim(),
      imageUrl: p.imageUrl ?? undefined,
    }))
    .filter((p) => p.query.length > 0);
  return { popular, vegBannerText: data.vegBannerText ?? null };
}

const isTypeaheadType = (value: string | null | undefined): value is 'restaurant' | 'dish' =>
  value === 'restaurant' || value === 'dish';

/**
 * Type-ahead suggestions for the term the customer is currently typing — a merge of
 * matching restaurant names and matching dish names across every menu. No-ops for a
 * blank term rather than hitting the endpoint, which 400s without `q`.
 */
export async function fetchTypeahead(query: string): Promise<TypeaheadResult[]> {
  const term = query.trim();
  if (!term) return [];
  const data = await apiGet<RawTypeahead>('/api/search/typeahead', { q: term });

  const results: TypeaheadResult[] = [];
  for (const r of data.results ?? []) {
    const id = r.id ?? '';
    const name = (r.name ?? '').trim();
    if (!id || !name || !isTypeaheadType(r.type)) continue;
    results.push({
      id,
      name,
      type: r.type,
      thumbnailUrl: r.thumbnailUrl ?? undefined,
      foodType: (r.foodType as TypeaheadResult['foodType']) ?? null,
    });
  }
  return results;
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
