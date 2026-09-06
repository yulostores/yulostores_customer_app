/**
 * search.ts — types for the Search tab's discovery surface.
 *
 * Shapes match the customer search endpoints in
 * yulo_backend/server/controllers/search.controller.js. The wire payload is
 * reshaped in src/services/search.ts — screens never see `_id` or a null
 * `imageUrl`.
 */

/** One tile in "Popular right now". */
export interface PopularSearch {
  /** The search term — also the tile's label. */
  query: string;
  /**
   * Representative image the backend resolved for this term (a curated
   * quick-filter icon, a matching dish photo, or a restaurant image for the
   * cuisine). Absent when the backend had nothing to show — the tile then
   * renders its own "no image" placeholder.
   */
  imageUrl?: string;
}

/** One row in "Recent searches" — the signed-in customer's own history. */
export interface RecentSearch {
  id: string;
  query: string;
}
