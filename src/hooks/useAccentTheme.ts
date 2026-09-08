/**
 * useAccentTheme — the app-wide accent palette, driven by the "VEG Only" switch.
 *
 * The whole app is orange (`Colors.foodAccent`) by default. It turns green the
 * moment the customer picks **"Pure veg restaurants only"** in the "See veg
 * dishes from" sheet — i.e. `vegMode.enabled && vegMode.scope === 'pure_veg_only'`.
 * "All restaurants" (or veg mode off) keeps the app orange; that scope still
 * filters dishes to vegetarian, it just doesn't recolour the app.
 *
 * `ORANGE_ACCENT` / `GREEN_ACCENT` are module singletons, so `useAccentTheme()`
 * returns a stable reference that only changes when the theme actually flips —
 * `useThemedStyles(makeStyles)` can therefore memoise a StyleSheet on it directly
 * and rebuild it only on that flip, never on every render.
 *
 * Only the accent family moves: `accent` (buttons / links / active states /
 * spinners), `accentLight` (tinted chip & badge backgrounds), `accentDark` (text
 * on `accentLight`, pressed states), `accentRing` (the tinted outline around a
 * round image on the canvas), `accentWash` (the gradient behind the home app
 * bar) and `sectionBand` (the faint tint behind alternate home-feed shelves).
 * Backgrounds, text and borders are the same in both themes and stay on
 * `Colors`.
 */

import { useMemo } from 'react';
import { Colors } from '../constants/Colors';
import { useVegMode } from '../context/VegModeContext';

export interface AccentTheme {
  /** Primary brand colour — buttons, links, active tabs, spinners. */
  accent: string;
  /** Tinted background behind accented chips / badges / icon bubbles. */
  accentLight: string;
  /** Darker accent — text on `accentLight`, pressed states. */
  accentDark: string;
  /** Tinted ring around a round image that sits directly on the canvas. */
  accentRing: string;
  /**
   * Gradient stops for the tinted wash behind an app bar, lightest first. The
   * last stop sits a hair off `Colors.foodBg` so the wash fades into the page
   * canvas rather than ending on a visible edge.
   */
  accentWash: readonly [string, string, string];
  /** Faint background tint behind alternate home-feed shelves. */
  sectionBand: string;
  /** True while the green "pure veg" palette is active. */
  isPureVeg: boolean;
}

/** Default palette — the brand orange. */
export const ORANGE_ACCENT: AccentTheme = {
  accent: Colors.foodAccent,
  accentLight: Colors.foodAccentLight,
  accentDark: Colors.foodAccentDark,
  accentRing: Colors.foodAccentRing,
  accentWash: [Colors.foodWashTop, Colors.foodWashMid, Colors.foodWashEdge],
  sectionBand: Colors.foodSectionBand,
  isPureVeg: false,
};

/** "Pure veg restaurants only" palette — the same green as every veg diet mark. */
export const GREEN_ACCENT: AccentTheme = {
  accent: Colors.foodVegGreen,
  accentLight: Colors.foodPureVegBg,
  accentDark: Colors.foodVegGreenDark,
  accentRing: Colors.foodVegRing,
  accentWash: [Colors.foodWashTopVeg, Colors.foodWashMidVeg, Colors.foodWashEdgeVeg],
  sectionBand: Colors.foodSectionBandVeg,
  isPureVeg: true,
};

/** The accent palette for the current veg-mode state. */
export function useAccentTheme(): AccentTheme {
  const { enabled, scope } = useVegMode();
  return enabled && scope === 'pure_veg_only' ? GREEN_ACCENT : ORANGE_ACCENT;
}

/**
 * Build a themed StyleSheet from a module-level factory:
 *
 *   const makeStyles = (t: AccentTheme) => StyleSheet.create({ cta: { backgroundColor: t.accent } });
 *   // inside the component:
 *   const styles = useThemedStyles(makeStyles);
 *
 * The factory must be a stable reference (declare it at module scope). The sheet
 * is rebuilt only when the accent palette flips.
 */
export function useThemedStyles<T>(factory: (t: AccentTheme) => T): T {
  const t = useAccentTheme();
  return useMemo(() => factory(t), [factory, t]);
}
