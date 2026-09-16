/**
 * Yulo Stores Brand Colors
 */

export const Colors = {
  // Brand
  primary: '#7B2FBE',
  primaryDark: '#5C1A9A',
  primaryLight: '#A855F7',
  secondary: '#F59E0B',
  secondaryDark: '#D97706',

  // Background
  bgDark: '#1A0533',
  bgMid: '#2D0B5C',
  bgCard: '#3B1278',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#C4B5FD',
  textMuted: '#8B7CC8',

  // Accents
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // UI
  border: '#4C1D95',
  divider: '#2D1B69',
  overlay: 'rgba(26, 5, 51, 0.85)',

  // Gradients
  gradientStart: '#1A0533',
  gradientEnd: '#4C1D95',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Splash / brand launch screen
  splashBg: '#FF5A00',
  splashBgDeep: '#F24A00',
  splashTitle: '#FFFFFF',
  splashTagline: 'rgba(255, 255, 255, 0.82)',
  splashLoader: 'rgba(255, 255, 255, 0.55)',

  // Auth / login screens (light surface, per design)
  authBg: '#F2F0EC',
  authSurface: '#FFFFFF',
  authText: '#1A1A1A',
  authTextMuted: '#8A8A8A',
  authBorder: '#E4E1DC',
  authField: '#FFFFFF',
  authAccent: '#FF5A00',
  authAccentText: '#FFFFFF',
  authDanger: '#D64545',
  // The "YULO STORES" wordmark on the sign-in screen — a deeper burnt orange
  // than authAccent, per the Figma spec (node 222:19).
  authWordmark: '#D9480F',

  // ─── Food-delivery app surfaces (light theme) ──────────────────────────────
  // Three surface tiers carry the whole visual hierarchy, and every screen picks
  // exactly one per element:
  //
  //   foodBg           the page canvas — the root of every screen, nothing else
  //   foodSurface      the content plane — cards, sheets, sticky bars, list blocks
  //   foodBgSecondary  a well *inside* a surface — image slot, pressed row, off pill
  //
  // The canvas is a warm off-white and the content plane is pure white, so a card
  // reads as a card from its own tone first; the hairline and the soft shadow only
  // finish the edge. That's what was missing while both were #FFFFFF — cards and
  // page were the same colour and the eye had nothing to latch onto.
  foodBg: '#F2F0EC',
  foodBgSecondary: '#EAE7E0',
  foodSurface: '#FFFFFF',
  // Loading blocks. Deliberately darker than either surface tier — a skeleton has
  // to read as "content pending" on the canvas *and* inside a white card.
  foodSkeleton: '#E3DFD7',

  // Text, in three steps of descending weight. Titles are near-black so they win
  // the first look; supporting copy sits well below them; meta (ETA, distance,
  // counts) sits below that again but stays legible at 11–12px, which the old
  // #9E9E9E did not.
  foodText: '#14161A',
  foodTextSecondary: '#5A5F68',
  foodTextMuted: '#8A8F99',

  foodAccent: '#FF5A00',
  // Tinted chip/badge background, and the text colour that goes on top of it.
  // accentDark is deliberately a deep burnt orange rather than a lighter one:
  // 11–12px badge labels need ~4.5:1 against foodAccentLight, which the previous
  // #E04E00 missed at 3.5:1.
  foodAccentLight: '#FFEDE2',
  foodAccentDark: '#B34700',
  // The ring drawn around a round food photo (the "What's on your mind?" chips).
  // A tinted peach rather than the grey card hairline: those circles sit directly
  // on the canvas with no card behind them, so they need an edge with some colour
  // in it to read as separate objects. foodVegRing is its pure-veg counterpart.
  foodAccentRing: '#FFB98A',
  foodVegRing: '#95CE99',

  // The warm wash behind the home app bar — the peach the location row, the
  // storefront tabs and the search pill all sit on. Three stops rather than two:
  // the last one lands close to `foodBg` so the header dissolves into the canvas
  // instead of ending on a seam. `*Veg` are the pure-veg counterparts, picked so
  // the green theme gets the same amount of tint, not a green-grey.
  foodWashTop: '#FDEBD9',
  foodWashMid: '#FCE0C6',
  foodWashEdge: '#F5F0E8',
  foodWashTopVeg: '#E9F6EA',
  foodWashMidVeg: '#DAEFDC',
  foodWashEdgeVeg: '#EFF2EC',

  // Home-feed section rhythm. The feed is a long scroll of shelves — "What's on
  // your mind?", "Recommended for you", the restaurant rails — and on one flat
  // canvas they ran together. Alternate shelves sit on this faint band instead:
  // a hair warmer/brighter than foodBg, paired with a hairline top and bottom, so
  // two neighbours separate without the page fragmenting. *Veg is the pure-veg
  // counterpart, tinted green by the same small amount.
  foodSectionBand: '#F8F1E8',
  foodSectionBandVeg: '#EDF5EB',

  // Icon tints for the storefronts Yulo sells through, on the home tab row.
  // Food takes the accent (it's the selected one and fills with it); these two
  // keep their own hue so the row reads as three destinations, not one repeated.
  foodVerticalGift: '#E0453F',
  foodVerticalBag: '#7C4522',

  // Hairline around a card and dividers inside one; the strong tone is for shapes
  // that must hold their own outline against white — inputs, unselected chips.
  foodBorder: '#E7E3DC',
  foodBorderStrong: '#D7D2C9',

  foodRating: '#FFB800',
  // Rating pill — a clean deep green, readable with white text and distinct from
  // the pure #0D8A16 of the veg diet mark.
  foodRatingBg: '#1F7A3D',
  // Shadow ink for every lifted surface. Warm near-black rather than pure black:
  // on a warm canvas a neutral-black shadow greys the surrounding pixels.
  foodCardShadow: '#1A1712',
  foodDeliveryBadge: '#4CAF50',
  foodTabBar: '#FFFFFF',
  foodTabActive: '#FF5A00',
  foodTabInactive: '#9096A1',
  // Search fields are white pills outlined by foodBorderStrong — a grey fill would
  // vanish now that the canvas is itself tinted.
  foodSearchBg: '#FFFFFF',
  foodHeartRed: '#E53935',
  foodVegGreen: '#0D8A16',
  // Darker green, the veg-mode counterpart of foodAccentDark — used for text on
  // foodPureVegBg and for pressed states while the app-wide "Pure veg" theme is on.
  foodVegGreenDark: '#0A6E11',
  foodPureVegBg: '#E8F5E9',
  foodNonVegRed: '#B0261A',
  // Toggle track for the "VEG Only" switch — off/grey vs on/green (the on-color
  // reuses foodVegGreen so the switch and every veg/non-veg dot read as one system).
  toggleTrackOff: '#D5D0C7',
  toggleThumb: '#FFFFFF',

  // ─── Location / address flow (app/location/*) ───
  // Reuses the food* light palette above for surfaces/text/accent; these are the
  // few extras the map picker needs.
  locMapWash: '#E8F3EC', // pale-green map placeholder on the entry screen
  locMapWashLine: '#D6E8DD', // faint grid lines drawn over the placeholder
  locScrim: 'rgba(17, 24, 39, 0.45)', // dim behind bottom sheets / modals
  locPinShadow: 'rgba(28, 28, 30, 0.20)', // ground shadow under the centre pin

  // ─── Onboarding carousel (app/onboarding.tsx) ───
  // Light surface matching the auth flow; colours sampled from the design mockups.
  onbBg: '#F7F5F2',
  onbHeading: '#101820', // near-black navy used for the bold uppercase titles
  onbBody: '#6B7280', // muted slate for the supporting copy
  onbDotActive: '#A01018', // crimson active pagination pill
  onbDotInactive: '#DCDAD5', // faint inactive pagination dots
  onbSkip: 'rgba(255, 255, 255, 0.92)', // "Skip" text, sits over the red blob
};

export default Colors;
