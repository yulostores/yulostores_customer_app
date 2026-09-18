/**
 * navigation.ts — the bottom tab bar, as data.
 *
 * The bar is a white floating pill: the active destination on the left as a
 * tinted pill with its label, a raised accent circle in the middle for the QR
 * scanner, and the remaining destinations to its right. Nothing about it is
 * decided in the component — which destinations exist, their order, their
 * labels, their icons, their colours and the bar's own proportions all come
 * from `GET /api/app/config` → `tabBar` (src/services/appConfig.ts).
 *
 * The canonical copy is the backend's `server/config/appConfig.config.js`
 * (TAB_BAR_ITEMS / TAB_BAR_THEMES / TAB_BAR_LAYOUT). The three literals below
 * are a deliberate synchronous twin of it — the tab bar has to draw on the
 * app's first frame and cannot wait on a fetch, and it must keep drawing when
 * the device is offline — exactly the arrangement `payments.ts` has with the
 * payment catalogue. `useTabBar` swaps in the live config the moment it lands,
 * so the twin is only ever the bootstrap value.
 *
 * The backend's `test/shared-config.contract.test.js` asserts the two are
 * identical. Change one, change the other, or a build breaks.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** How a tab draws itself. */
export type TabShape = 'pill' | 'fab';

/** Where a tab's glyph comes from. */
export type TabIconSource = 'ionicons' | 'asset';

/** A live counter painted on a tab, or null for none. */
export type TabBadgeSource = 'cart';

export interface TabBarItem {
  /** Stable key, independent of the route. */
  id: string;
  /** expo-router route name inside the `(tabs)` group, e.g. "index". */
  route: string;
  /** Shown on a `pill`; the accessibility label on a `fab`. */
  label: string;
  shape: TabShape;
  iconSource: TabIconSource;
  /** Ionicons glyph name, or a key in the app's bundled-icon registry. */
  icon: string;
  /** The same, for the focused state. */
  activeIcon: string;
  badge: TabBadgeSource | null;
}

export interface TabBarPalette {
  /** The floating bar itself. */
  bar: string;
  /** Fill behind the focused pill. */
  activePill: string;
  /** Icon + label of the focused pill. */
  activeTint: string;
  /** Icon + label of an unfocused pill. */
  inactiveTint: string;
  /** The raised circle. */
  fab: string;
  /** The glyph inside it. */
  fabTint: string;
  badge: string;
  badgeTint: string;
}

/** One palette per app-wide accent theme — see `useAccentTheme`. */
export interface TabBarThemes {
  default: TabBarPalette;
  pure_veg: TabBarPalette;
}

/** Every measurement the bar is built from, in dp. */
export interface TabBarLayout {
  barHeight: number;
  barRadius: number;
  barPadding: number;
  sideInset: number;
  /** Minimum gap under the bar; the device's gesture inset wins when larger. */
  bottomInset: number;
  pillHeight: number;
  pillRadius: number;
  pillPaddingX: number;
  pillGap: number;
  iconSize: number;
  labelSize: number;
  fabSize: number;
  fabIconSize: number;
}

export interface TabBarConfig {
  items: TabBarItem[];
  themes: TabBarThemes;
  layout: TabBarLayout;
}

// ─── The twin ───────────────────────────────────────────────────────────────
//
// Plain literals, no imports — the backend contract test evaluates them as data.

export const TAB_BAR_ITEMS = [
  {
    id: 'home',
    route: 'index',
    label: 'Delivery',
    shape: 'pill',
    iconSource: 'ionicons',
    icon: 'bicycle-outline',
    activeIcon: 'bicycle',
    badge: null,
  },
  {
    id: 'scan',
    route: 'scan',
    label: 'Scan a QR code',
    shape: 'fab',
    iconSource: 'asset',
    icon: 'qr-scan',
    activeIcon: 'qr-scan',
    badge: null,
  },
  {
    id: 'orders',
    route: 'orders',
    label: 'History',
    shape: 'pill',
    iconSource: 'ionicons',
    icon: 'time-outline',
    activeIcon: 'time',
    badge: null,
  },
];

export const TAB_BAR_THEMES = {
  default: {
    bar: '#FFFFFF',
    activePill: '#FFEDE2',
    activeTint: '#FF5A00',
    inactiveTint: '#4A4F58',
    fab: '#FF5A00',
    fabTint: '#FFFFFF',
    badge: '#FF5A00',
    badgeTint: '#FFFFFF',
  },
  pure_veg: {
    bar: '#FFFFFF',
    activePill: '#E8F5E9',
    activeTint: '#0D8A16',
    inactiveTint: '#4A4F58',
    fab: '#0D8A16',
    fabTint: '#FFFFFF',
    badge: '#0D8A16',
    badgeTint: '#FFFFFF',
  },
};

export const TAB_BAR_LAYOUT = {
  barHeight: 64,
  barRadius: 32,
  barPadding: 6,
  sideInset: 16,
  bottomInset: 12,
  pillHeight: 48,
  pillRadius: 24,
  pillPaddingX: 18,
  pillGap: 8,
  iconSize: 24,
  labelSize: 15,
  fabSize: 54,
  fabIconSize: 26,
};

/** The twin, as the typed shape the bar consumes. Used until the fetch lands. */
export const FALLBACK_TAB_BAR: TabBarConfig = {
  items: TAB_BAR_ITEMS as TabBarItem[],
  themes: TAB_BAR_THEMES as TabBarThemes,
  layout: TAB_BAR_LAYOUT as TabBarLayout,
};
