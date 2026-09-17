import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { Elevation } from '../../src/constants/Theme';
import { useAccentTheme } from '../../src/hooks/useAccentTheme';
import { useCartBadge } from '../../src/hooks/useCartBadge';

// The bottom tab bar is a permanent fixture — it never slides away or auto-hides.
// The phone's own navigation bar is the one that fades out after a few idle
// seconds; that lives in `useSystemNavBarAutoHide` at the app root.
//
// Android is edge-to-edge by default (SDK 57 / RN new architecture), so this
// screen draws behind the system nav bar/gesture pill. That inset varies a lot
// by device — ~48dp for 3-button nav, ~16-24dp for gesture nav, 0 on some
// tablets — so it must come from `useSafeAreaInsets`, not a fixed constant, or
// the tab bar either overlaps the gesture area or leaves a dead gap under it.
const BASE_TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 60 : 56;
const MIN_BOTTOM_PADDING = Platform.OS === 'ios' ? 28 : 12;

// Six tabs share the width, so the narrowest phone we support (320dp) gives each
// item ~53dp. "Profile" and "Orders" still fit on one line at this size; anything
// larger starts truncating with an ellipsis on small screens.
const TAB_ICON_SIZE = 23;

export default function TabLayout() {
  const t = useAccentTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, MIN_BOTTOM_PADDING);

  // Live unit count in the server cart — see the hook for how it is reconciled.
  const cartCount = useCartBadge();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: Colors.foodTabInactive,
        tabBarStyle: [
          styles.tabBar,
          { height: BASE_TAB_BAR_HEIGHT + bottomPadding, paddingBottom: bottomPadding },
        ],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'search' : 'search-outline'}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused }) => (
            <View style={styles.scanIconWrap}>
              <Image
                source={require('../../assets/Images/Icons/qr-scan.png')}
                style={[
                  styles.scanIcon,
                  { tintColor: focused ? t.accent : Colors.foodTabInactive },
                ]}
                resizeMode="contain"
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bag' : 'bag-outline'}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          // `undefined` (not 0 or '') is what hides the dot entirely when the
          // cart is empty. Past 99 the bubble would grow wide enough to clip its
          // neighbours, so it caps.
          tabBarBadge:
            cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : undefined,
          tabBarBadgeStyle: [styles.tabBarBadge, { backgroundColor: t.accent }],
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.foodTabBar,
    borderTopColor: Colors.foodBorder,
    borderTopWidth: 1,
    paddingTop: 8,
    ...Elevation.sticky,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabBarItem: {
    paddingHorizontal: 2,
  },
  tabBarBadge: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  scanIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIcon: {
    width: 24,
    height: 24,
  },
});
