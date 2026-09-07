/**
 * useRestaurantDetail.ts — data for the restaurant storefront screen, loaded lazily.
 *
 * Two cheap calls up front — `GET /api/restaurants/:id` and
 * `GET /api/restaurants/:id/menu/categories` — give the header and the *collapsed*
 * section list (names + item counts, no dishes). Items for a category are pulled a
 * page at a time from `GET /api/restaurants/:id/menu-items` only when that section is
 * expanded or scrolled to, so opening a big menu never downloads it whole.
 *
 * Mirrors {@link useHomeData}'s shape: request-id guards so a stale response can't
 * land on fresh state, and the app-wide severity split (`ApiError` 4xx → warn,
 * 5xx / unreachable → reportError). A 404 (unapproved / deleted restaurant) is
 * surfaced separately as `notFound`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  fetchMenuCategories,
  fetchMenuItemsPage,
  fetchRestaurant,
} from '../services/restaurants';
import type { MenuItem, Restaurant } from '../types/restaurant';

/** Backend default page size for `/menu-items` — stated here so paging maths lines up. */
export const MENU_PAGE_SIZE = 10;

export type MenuDietFilter = 'all' | 'veg' | 'non_veg';

export interface MenuSection {
  id: string;
  name: string;
  /** Available-item count for the whole category, from the summary call. */
  itemCount: number;
  subCategories: { id: string; name: string }[];
  expanded: boolean;
  /** Items loaded so far (may be a prefix of the category). */
  items: MenuItem[];
  /** Highest page fetched; `0` before the first fetch. */
  page: number;
  /** Total pages for the current diet filter; `1` until the first fetch resolves. */
  pages: number;
  status: 'idle' | 'loading' | 'error' | 'ready';
  error: string | null;
}

interface UseRestaurantDetailResult {
  restaurant: Restaurant | null;
  sections: MenuSection[];
  isLoading: boolean;
  error: string | null;
  /** The restaurant id resolved to nothing visible — 404 from the API. */
  notFound: boolean;
  refresh: () => Promise<void>;
  /** Expand / collapse a section. Expanding one for the first time loads its page 1. */
  toggleSection: (id: string) => void;
  /** Pull the next page for a section, if it has one and isn't already loading. */
  loadMore: (id: string) => void;
  /** Re-attempt the page that failed for a section. */
  retrySection: (id: string) => void;
}

function readApiError(err: unknown): { status: number; code: string } | null {
  return err instanceof ApiError ? { status: err.status, code: err.code } : null;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useRestaurantDetail(
  restaurantId: string | undefined,
  dietFilter: MenuDietFilter,
): UseRestaurantDetailResult {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Latest values read by callbacks that must not be re-created on every change.
  const sectionsRef = useRef<MenuSection[]>([]);
  sectionsRef.current = sections;
  const dietRef = useRef(dietFilter);
  dietRef.current = dietFilter;

  // Guards. `requestRef` for the top-level load; one token per section for its
  // in-flight page request — a superseded diet filter or a fast double-tap can't
  // append the wrong page.
  const requestRef = useRef(0);
  const pageTokens = useRef<Record<string, number>>({});
  // The diet-reset effect must sit out the initial mount and any restaurant reload.
  const readyRef = useRef(false);

  const loadPage = useCallback(
    async (sectionId: string, page: number) => {
      if (!restaurantId) return;
      const token = (pageTokens.current[sectionId] ?? 0) + 1;
      pageTokens.current[sectionId] = token;
      const isCurrent = () =>
        mountedRef.current && pageTokens.current[sectionId] === token;

      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, status: 'loading', error: null } : s,
        ),
      );

      try {
        const { items, pagination } = await fetchMenuItemsPage(restaurantId, {
          categoryId: sectionId,
          foodType: dietRef.current,
          page,
          limit: MENU_PAGE_SIZE,
        });
        if (!isCurrent()) return;
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== sectionId) return s;
            let merged: MenuItem[];
            if (page <= 1) {
              merged = items;
            } else {
              const seen = new Set(s.items.map((i) => i._id));
              merged = [...s.items, ...items.filter((i) => !seen.has(i._id))];
            }
            return {
              ...s,
              items: merged,
              page: pagination.page,
              pages: pagination.pages,
              status: 'ready',
              error: null,
            };
          }),
        );
      } catch (err) {
        const apiErr = readApiError(err);
        if (apiErr && apiErr.status >= 400 && apiErr.status < 500) {
          logger.warn(
            'restaurant',
            `Menu page unavailable — ${apiErr.status} ${apiErr.code}`,
            { restaurantId, sectionId, page },
          );
        } else {
          reportError('restaurant', 'Failed to load a menu page', err, {
            restaurantId,
            sectionId,
            page,
          });
        }
        if (!isCurrent()) return;
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  status: 'error',
                  error: messageFor(err, 'Could not load these items.'),
                }
              : s,
          ),
        );
      }
    },
    [restaurantId],
  );

  const load = useCallback(async () => {
    if (!restaurantId) return;
    const reqId = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current && requestRef.current === reqId;

    readyRef.current = false;
    setIsLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const [detail, categories] = await Promise.all([
        fetchRestaurant(restaurantId),
        fetchMenuCategories(restaurantId),
      ]);
      if (!isCurrent()) return;

      setRestaurant(detail);
      const firstWithItems = categories.findIndex((c) => c.itemCount > 0);
      const seeded: MenuSection[] = categories.map((c, i) => ({
        id: c.id,
        name: c.name,
        itemCount: c.itemCount,
        subCategories: c.subCategories ?? [],
        expanded: i === firstWithItems,
        items: [],
        page: 0,
        pages: 1,
        status: i === firstWithItems ? 'loading' : 'idle',
        error: null,
      }));
      setSections(seeded);
      setIsLoading(false);
      readyRef.current = true;
      if (firstWithItems >= 0) loadPage(categories[firstWithItems].id, 1);
    } catch (err) {
      const apiErr = readApiError(err);
      if (apiErr && apiErr.status === 404) {
        logger.warn('restaurant', 'Restaurant detail 404', { restaurantId });
        if (isCurrent()) {
          setNotFound(true);
          setError('This restaurant is no longer available.');
        }
      } else if (apiErr && apiErr.status >= 400 && apiErr.status < 500) {
        logger.warn(
          'restaurant',
          `Restaurant detail unavailable — ${apiErr.status} ${apiErr.code}`,
          { restaurantId },
        );
        if (isCurrent()) setError(messageFor(err, 'Could not load this restaurant.'));
      } else {
        reportError('restaurant', 'Failed to load restaurant detail', err, {
          restaurantId,
        });
        if (isCurrent()) setError(messageFor(err, 'Could not load this restaurant.'));
      }
      if (isCurrent()) setIsLoading(false);
    }
  }, [restaurantId, loadPage]);

  useEffect(() => {
    load();
  }, [load]);

  // Diet filter changed after the first load: drop every section's items and
  // re-pull page 1 for the ones the customer had open — collapsed sections stay
  // collapsed and reload lazily when next expanded.
  useEffect(() => {
    if (!readyRef.current) return;
    const expandedIds = sectionsRef.current
      .filter((s) => s.expanded)
      .map((s) => s.id);
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: [],
        page: 0,
        pages: 1,
        status: s.expanded ? 'loading' : 'idle',
        error: null,
      })),
    );
    for (const id of expandedIds) loadPage(id, 1);
  }, [dietFilter, loadPage]);

  const toggleSection = useCallback(
    (id: string) => {
      const current = sectionsRef.current.find((s) => s.id === id);
      const willExpand = current ? !current.expanded : false;
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)),
      );
      if (
        willExpand &&
        current &&
        current.status === 'idle' &&
        current.itemCount > 0
      ) {
        loadPage(id, 1);
      }
    },
    [loadPage],
  );

  const loadMore = useCallback(
    (id: string) => {
      const s = sectionsRef.current.find((x) => x.id === id);
      if (!s || !s.expanded || s.status === 'loading') return;
      if (s.page === 0 || s.page >= s.pages) return;
      loadPage(id, s.page + 1);
    },
    [loadPage],
  );

  const retrySection = useCallback(
    (id: string) => {
      const s = sectionsRef.current.find((x) => x.id === id);
      if (!s) return;
      loadPage(id, s.page > 0 ? s.page + 1 : 1);
    },
    [loadPage],
  );

  return {
    restaurant,
    sections,
    isLoading,
    error,
    notFound,
    refresh: load,
    toggleSection,
    loadMore,
    retrySection,
  };
}
