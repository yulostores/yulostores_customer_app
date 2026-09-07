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
  authBg: '#F7F5F2',
  authSurface: '#FFFFFF',
  authText: '#1A1A1A',
  authTextMuted: '#8A8A8A',
  authBorder: '#E4E1DC',
  authField: '#FFFFFF',
  authAccent: '#FF5A00',
  authAccentText: '#FFFFFF',
  authDanger: '#D64545',

  // ─── Food-delivery home screen (light theme) ───
  foodBg: '#FFFFFF',
  foodBgSecondary: '#F5F5F5',
  foodSurface: '#FFFFFF',
  foodText: '#1C1C1C',
  foodTextSecondary: '#6B6B6B',
  foodTextMuted: '#9E9E9E',
  foodAccent: '#FF5A00',
  foodAccentLight: '#FFF0E6',
  foodAccentDark: '#E04E00',
  foodBorder: '#EEEEEE',
  foodRating: '#FFB800',
  foodRatingBg: '#2C6E1A',
  foodCardBg: '#FFFFFF',
  foodCardShadow: 'rgba(0,0,0,0.06)',
  foodDeliveryBadge: '#4CAF50',
  foodTabBar: '#FFFFFF',
  foodTabActive: '#FF5A00',
  foodTabInactive: '#9E9E9E',
  foodSearchBg: '#F2F2F2',
  foodHeartRed: '#E53935',
  foodVegGreen: '#0D8A16',
  // Darker green, the veg-mode counterpart of foodAccentDark — used for text on
  // foodPureVegBg and for pressed states while the app-wide "Pure veg" theme is on.
  foodVegGreenDark: '#0A6E11',
  foodPureVegBg: '#E8F5E9',
  foodNonVegRed: '#B0261A',
  // Toggle track for the "VEG Only" switch — off/grey vs on/green (the on-color
  // reuses foodVegGreen so the switch and every veg/non-veg dot read as one system).
  toggleTrackOff: '#D8D8D8',
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
