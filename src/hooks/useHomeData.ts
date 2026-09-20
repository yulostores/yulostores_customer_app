/**
 * useHomeData.ts — data for the home screen, from one backend call.
 *
 * Everything the Home sections render comes from `GET /api/home/feed`, reshaped
 * in src/services/home.ts:
 *  - cuisines               → "What's on your mind?" (the curated chips)
 *  - banner                 → the featured-offer hero, when one is running
 *  - recommendedItems       → "Recommended for you"
 *  - recommendedRestaurants → "Recommended restaurants" horizontal cards
 *  - nearbyRestaurants      → "Restaurants near you" vertical list
 *
 * The feed is geo-scoped: the backend requires `lat`/`lng` and 400s without
 * them. So this hook stays idle until {@link useDeliveryLocation} has an active
 * location, and refetches whenever that location changes. `hasLocation` tells
 * the screen which of the two empty states to show — "pick a location" versus
 * "nothing delivers here yet" — instead of rendering a blank page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeliveryLocation } from '../context/DeliveryLocationContext';
import { useVegMode } from '../context/VegModeContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchHomeFeed, type HomeFeedData } from '../services/home';

export type HomeData = HomeFeedData;

interface UseHomeDataResult extends HomeData {
  isLoading: boolean;
  error: string | null;
  /** False while the customer has no delivery location — nothing was fetched. */
  hasLocation: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: HomeData = {
  cuisines: [],
  recommendedItems: [],
  recommendedRestaurants: [],
  nearbyRestaurants: [],
  banner: null,
  vegBannerText: null,
};

export function useHomeData(): UseHomeDataResult {
  const { activeLocation, hydrated } = useDeliveryLocation();
  const { enabled: vegMode, scope: vegScope } = useVegMode();
  // `unlocated` addresses carry a placeholder coordinate, not a real one — fetching with it
  // would show a feed for somewhere the customer isn't. Treated as "no location" so the
  // screen prompts for one instead. See ActiveLocation.unlocated.
  const located = activeLocation != null && !activeLocation.unlocated;
  const lat = located ? activeLocation.coordinates.latitude : undefined;
  const lng = located ? activeLocation.coordinates.longitude : undefined;
  const hasLocation = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  const [data, setData] = useState<HomeData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Changing the delivery location starts a new fetch while the previous one may
  // still be in flight. Only the newest request is allowed to write state, so a
  // slow response for the old location can never land on top of the new one.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    // No delivery location yet → nothing to fetch. Keep the skeleton up only
    // until the cached location has had its chance to hydrate; after that the
    // screen shows its "choose a location" prompt.
    if (!hasLocation) {
      if (isCurrent()) {
        setData(EMPTY);
        setError(null);
        setIsLoading(!hydrated);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const feed = await fetchHomeFeed({ lat: lat!, lng: lng!, vegMode, vegScope });
      if (isCurrent()) setData(feed);
    } catch (err) {
      // 4xx is a handled, expected failure (bad params, nothing nearby) — warn,
      // per the app-wide severity split. Only 5xx / unreachable is a real error
      // worth a developer's attention (and a crash report later).
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('home', `Home feed unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('home', 'Failed to load home screen data', err);
      }
      if (isCurrent()) {
        setData(EMPTY);
        setError(err instanceof Error ? err.message : 'Failed to load home data');
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [lat, lng, hasLocation, hydrated, vegMode, vegScope]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...data,
    isLoading,
    error,
    hasLocation,
    refresh: load,
  };
}
