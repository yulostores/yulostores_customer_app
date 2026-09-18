/**
 * useTabBar — the bottom tab bar's definition, resolved for right now.
 *
 * Three things decide what the bar looks like, and none of them is the
 * component that draws it:
 *
 *   1. `GET /api/app/config` → `tabBar` (via {@link useAppConfig}, module-cached
 *      so this costs nothing beyond the one request Settings already makes)
 *      supplies the destinations, their labels, icons, the two palettes and the
 *      bar's proportions.
 *   2. The veg switch picks which of those two palettes is live — `pure_veg`
 *      while the customer is on "Pure veg restaurants only", `default`
 *      otherwise. This is the same bit {@link useAccentTheme} reads, so the bar
 *      turns green on exactly the same flip as every other accent in the app.
 *   3. The server cart supplies the count for any item whose `badge` is 'cart'.
 *
 * Until the config lands (first launch, cold start, offline) the synchronous
 * twin in `src/services/navigation.ts` stands in, so the bar draws on the first
 * frame and never flashes empty. Once the fetch resolves the live config takes
 * over — if a colour or a destination changed on the server, the bar changes
 * with it, no app release.
 */

import { useMemo } from 'react';
import { useAccentTheme } from './useAccentTheme';
import { useAppConfig } from './useAppConfig';
import { useCartBadge } from './useCartBadge';
import {
  FALLBACK_TAB_BAR,
  type TabBarItem,
  type TabBarLayout,
  type TabBarPalette,
} from '../services/navigation';

export interface ResolvedTabBar {
  /** Destinations, in the order the bar should draw them. */
  items: TabBarItem[];
  /** The palette for the accent theme that is currently live. */
  palette: TabBarPalette;
  layout: TabBarLayout;
  /** Live server-cart unit count, for items badged 'cart'. */
  cartCount: number;
}

export function useTabBar(): ResolvedTabBar {
  const { config } = useAppConfig();
  const { isPureVeg } = useAccentTheme();
  const cartCount = useCartBadge();

  const tabBar = config?.tabBar ?? FALLBACK_TAB_BAR;
  const palette = isPureVeg ? tabBar.themes.pure_veg : tabBar.themes.default;

  return useMemo(
    () => ({ items: tabBar.items, palette, layout: tabBar.layout, cartCount }),
    [tabBar.items, palette, tabBar.layout, cartCount],
  );
}
