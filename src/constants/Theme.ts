import { Colors } from './Colors';

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 42,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

/**
 * Light-theme elevation.
 *
 * One shadow ink (a warm near-black — pure black greys the warm canvas around a
 * card) at four strengths, so every lifted thing in the app casts the same kind
 * of shadow and the eye can read depth as meaning:
 *
 *   card    a resting card on the canvas — wide and faint; the hairline border
 *           draws the edge, the shadow only lifts it off the page
 *   raised  a control floating over content — search pill, FAB, logo bubble
 *   sticky  a bar docked to the bottom edge; the offset points up, at the content
 *   sheet   a modal or bottom sheet, the only thing above everything else
 *
 * Android reads `elevation` and ignores the rest, so the two are tuned together
 * rather than one being a fallback for the other.
 */
const SHADOW_INK = Colors.foodCardShadow;

export const Elevation = {
  card: {
    shadowColor: SHADOW_INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: SHADOW_INK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  sticky: {
    shadowColor: SHADOW_INK,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 12,
  },
  sheet: {
    shadowColor: SHADOW_INK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 16,
  },
} as const;

/**
 * The older names, kept because ~20 screens spread `...Shadows.sm` into their
 * card styles. They now alias the scale above — `sm` used to be a tight, hard
 * drop (2px blur at 18% black) that read as a dark line under a white card, and
 * `md`/`lg` still cast the purple of the retired dark theme.
 */
export const Shadows = {
  sm: Elevation.card,
  md: Elevation.raised,
  lg: Elevation.sheet,
};
