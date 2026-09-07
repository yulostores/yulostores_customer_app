import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { Colors } from '../../src/constants/Colors';
import { useAccentTheme } from '../../src/hooks/useAccentTheme';

// The bottom bar slides itself out of the way after a few seconds of no
// touches, and slides back the instant the user taps or scrolls anywhere.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
const HIDDEN_OFFSET = TAB_BAR_HEIGHT + 12; // push the top border + shadow off too
const IDLE_DELAY_MS = 3000;

/**
 * Drives an `Animated.Value` between 0 (bar shown) and `HIDDEN_OFFSET` (bar
 * slid below the screen). `onInteraction()` is meant to be called from a
 * capture-phase responder so any touch — a tap or the start of a scroll —
 * cancels the pending hide and brings the bar back.
 */
function useAutoHideTabBar() {
  const translateY = useRef(new Animated.Value(0)).current;
  const hidden = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideTo = useCallback(
    (toValue: number) => {
      Animated.timing(translateY, {
        toValue,
        duration: toValue === 0 ? 200 : 240,
        useNativeDriver: true,
      }).start();
    },
    [translateY],
  );

  const armTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      hidden.current = true;
      slideTo(HIDDEN_OFFSET);
    }, IDLE_DELAY_MS);
  }, [slideTo]);

  const onInteraction = useCallback(() => {
    if (hidden.current) {
      hidden.current = false;
      slideTo(0);
    }
    armTimer();
  }, [armTimer, slideTo]);

  useEffect(() => {
    armTimer();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armTimer]);

  return { translateY, onInteraction };
}

export default function TabLayout() {
  const t = useAccentTheme();
  const { translateY, onInteraction } = useAutoHideTabBar();

  // Passive sniffer: never becomes the responder (returns false), it only notes
  // that the user did something so the bar can reappear / stay put.
  const handleStartCapture = useCallback(() => {
    onInteraction();
    return false;
  }, [onInteraction]);

  return (
    <View style={styles.host} onStartShouldSetResponderCapture={handleStartCapture}>
      {/* Fills the strip the bar leaves behind, so the slide reveals matching
          white rather than whatever sits under the navigator. */}
      <View style={styles.tabBarUnderlay} pointerEvents="none" />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.accent,
          tabBarInactiveTintColor: Colors.foodTabInactive,
          tabBarStyle: [styles.tabBar, { transform: [{ translateY }] }],
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" size={size} color={color} />
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
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />

        {/* Hidden tabs — screens kept for future stack navigation */}

        <Tabs.Screen
          name="cart"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  tabBarUnderlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR_HEIGHT,
    backgroundColor: Colors.foodTabBar,
  },
  tabBar: {
    backgroundColor: Colors.foodTabBar,
    borderTopColor: Colors.foodBorder,
    borderTopWidth: 1,
    height: TAB_BAR_HEIGHT,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  scanIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIcon: {
    width: 26,
    height: 26,
  },
});
