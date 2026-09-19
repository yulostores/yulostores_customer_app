/**
 * TabBar — the app's bottom navigation, drawn from config.
 *
 * A white pill that floats over the page: the current destination on the left
 * as a tinted pill carrying its label, a raised accent circle in the middle for
 * the QR scanner, and the remaining destinations to its right. The whole thing
 * is orange normally and green while "Pure veg restaurants only" is on — the
 * same flip every other accent in the app makes (see `useAccentTheme`).
 *
 * This file decides *how* to draw a tab bar, never *what* is in one. The
 * destinations, their order, labels, icons, both palettes and every measurement
 * come from `GET /api/app/config` → `tabBar` by way of {@link useTabBar}; a
 * destination added, renamed, recoloured or removed on the backend changes the
 * bar with no app release. The one thing that cannot be data is which PNG files
 * ship in the bundle: Metro resolves `require()` at build time, so a bundled
 * glyph is registered by name in {@link BUNDLED_ICONS} and the config refers to
 * it by that key.
 *
 * It renders absolutely at the bottom of the navigator under a `box-none` root,
 * so screens keep the full height and their content scrolls behind it. A screen
 * whose last row must clear the bar pads its scroll content by
 * {@link useTabBarInset}.
 *
 * A route the config doesn't mention gets no bar at all — the cart, search and
 * profile screens live in `(tabs)` but are destinations you arrive at and back
 * out of, and each draws its own header arrow.
 *
 * Props are the shape expo-router hands a custom `tabBar`, declared structurally
 * here rather than imported: since SDK 56 the bundler hard-fails on any
 * `@react-navigation/*` import (see `useCanGoBack`).
 */

import { Ionicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { useTabBar } from '../hooks/useTabBar';
import { useCameraOpen } from '../lib/cameraOpen';
import {
  FALLBACK_TAB_BAR,
  type TabBarItem,
  type TabBarLayout,
  type TabBarPalette,
} from '../services/navigation';

/**
 * Bundled glyphs the config can name with `iconSource: 'asset'`. Metro needs a
 * literal path in `require`, so this map is the one place a new bundled tab icon
 * has to be added; everything else about it stays server-side.
 */
const BUNDLED_ICONS: Record<string, number> = {
  'qr-scan': require('../../assets/Images/Icons/qr-scan.png'),
};

// ─── Props (structural — see the header note) ───────────────────────────────

interface TabBarRoute {
  key: string;
  name: string;
}

export interface TabBarProps {
  state: { index: number; routes: TabBarRoute[] };
  navigation: {
    emit(event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
}

// ─── Height ─────────────────────────────────────────────────────────────────

/**
 * How much room to leave under a screen's scroll content so its last row clears
 * the floating bar. Reads the same config the bar does, so it stays correct if
 * the bar's proportions change server-side.
 */
export function useTabBarInset(): number {
  const { layout } = useTabBar();
  const insets = useSafeAreaInsets();
  return layout.barHeight + Math.max(insets.bottom, layout.bottomInset) + layout.sideInset;
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function TabGlyph({
  item,
  focused,
  color,
  size,
}: {
  item: TabBarItem;
  focused: boolean;
  color: string;
  size: number;
}) {
  const name = focused ? item.activeIcon : item.icon;

  if (item.iconSource === 'asset') {
    const source = BUNDLED_ICONS[name];
    // An asset key this bundle doesn't carry — the config is ahead of the build.
    // Leave the space rather than crash; the tab is still labelled and tappable.
    if (!source) return <View style={{ width: size, height: size }} />;
    return (
      <Image
        source={source}
        style={{ width: size, height: size, tintColor: color }}
        resizeMode="contain"
      />
    );
  }

  return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}

function TabBadge({ count, palette }: { count: number; palette: TabBarPalette }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: palette.badge }]}>
      <Text style={[styles.badgeText, { color: palette.badgeTint }]} numberOfLines={1}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

interface TabProps {
  item: TabBarItem;
  focused: boolean;
  badgeCount: number;
  palette: TabBarPalette;
  layout: TabBarLayout;
  onPress: () => void;
}

/** An icon + label that fills with the accent tint while it is the open screen. */
function PillTab({ item, focused, badgeCount, palette, layout, onPress }: TabProps) {
  const tint = focused ? palette.activeTint : palette.inactiveTint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={item.label}
      style={({ pressed }) => [
        styles.pill,
        {
          height: layout.pillHeight,
          borderRadius: layout.pillRadius,
          paddingHorizontal: layout.pillPaddingX,
          gap: layout.pillGap,
          backgroundColor: focused ? palette.activePill : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <TabGlyph item={item} focused={focused} color={tint} size={layout.iconSize} />
      <Text
        numberOfLines={1}
        style={[styles.pillLabel, { color: tint, fontSize: layout.labelSize }]}
      >
        {item.label}
      </Text>
      <TabBadge count={badgeCount} palette={palette} />
    </Pressable>
  );
}

/** The raised accent circle in the middle of the bar. */
function FabTab({ item, focused, badgeCount, palette, layout, onPress }: TabProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={item.label}
      style={({ pressed }) => [
        styles.fab,
        {
          width: layout.fabSize,
          height: layout.fabSize,
          borderRadius: layout.fabSize / 2,
          marginHorizontal: layout.pillGap,
          backgroundColor: palette.fab,
          // The glow under the circle is the accent itself, not the app's grey
          // shadow ink — that is what makes it read as lit rather than lifted.
          shadowColor: palette.fab,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <TabGlyph item={item} focused={focused} color={palette.fabTint} size={layout.fabIconSize} />
      <TabBadge count={badgeCount} palette={palette} />
    </Pressable>
  );
}

// ─── The bar ────────────────────────────────────────────────────────────────

export default function TabBar({ state, navigation }: TabBarProps) {
  const { items, palette, layout, cartCount } = useTabBar();
  const insets = useSafeAreaInsets();
  const cameraOpen = useCameraOpen();

  const current = state.routes[state.index]?.name;

  // Only the destinations the config lists, in its order, and only those this
  // build actually has a screen for.
  const known = new Set(state.routes.map((r) => r.name));
  const visible = items.filter((item) => known.has(item.route));

  // The bar belongs to the destinations it contains. Anywhere else in `(tabs)`
  // — cart, search, profile — is a screen you back out of, not a tab.
  if (!visible.some((item) => item.route === current)) return null;

  // The QR scanner's camera is full-screen; the bar steps aside until it closes.
  if (cameraOpen) return null;

  const press = (item: TabBarItem) => () => {
    const route = state.routes.find((r) => r.name === item.route);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented && route.name !== current) {
      navigation.navigate(route.name);
    }
  };

  const render = (item: TabBarItem) => {
    const Tab = item.shape === 'fab' ? FabTab : PillTab;
    return (
      <Tab
        key={item.id}
        item={item}
        focused={item.route === current}
        badgeCount={item.badge === 'cart' ? cartCount : 0}
        palette={palette}
        layout={layout}
        onPress={press(item)}
      />
    );
  };

  // Split around the raised circle so it lands dead centre however wide the
  // labels either side of it happen to be. With no `fab` in the config the two
  // groups simply share the bar evenly.
  const fabIndex = visible.findIndex((item) => item.shape === 'fab');
  const hasFab = fabIndex !== -1;
  const left = hasFab ? visible.slice(0, fabIndex) : visible;
  const right = hasFab ? visible.slice(fabIndex + 1) : [];

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          paddingHorizontal: layout.sideInset,
          paddingBottom: Math.max(insets.bottom, layout.bottomInset),
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            height: layout.barHeight,
            borderRadius: layout.barRadius,
            paddingHorizontal: layout.barPadding,
            backgroundColor: palette.bar,
          },
        ]}
      >
        <View style={[styles.group, styles.groupStart]}>{left.map(render)}</View>
        {hasFab ? render(visible[fabIndex]) : null}
        <View style={[styles.group, styles.groupEnd]}>{right.map(render)}</View>
      </View>
    </View>
  );
}

/** The bar's resting height, for a screen that needs a number before layout. */
export const TAB_BAR_BASE_HEIGHT = FALLBACK_TAB_BAR.layout.barHeight;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // The bar sits on photography as often as on the canvas, so it carries a
    // deeper shadow than `Elevation.raised` — enough to hold its own white
    // against a bright image without needing a border.
    shadowColor: Colors.foodCardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  group: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupStart: {
    justifyContent: 'flex-start',
  },
  groupEnd: {
    justifyContent: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    // A label can be longer than its share of a narrow bar; let it shrink and
    // ellipsize rather than push the circle off centre.
    flexShrink: 1,
  },
  pillLabel: {
    fontWeight: '700',
    flexShrink: 1,
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 2 : 0,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
