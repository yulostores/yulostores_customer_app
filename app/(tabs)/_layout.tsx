import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Colors } from '../../src/constants/Colors';
import { Elevation } from '../../src/constants/Theme';
import { useAccentTheme } from '../../src/hooks/useAccentTheme';

// The bottom tab bar is a permanent fixture — it never slides away or auto-hides.
// The phone's own navigation bar is the one that fades out after a few idle
// seconds; that lives in `useSystemNavBarAutoHide` at the app root.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;

export default function TabLayout() {
  const t = useAccentTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: Colors.foodTabInactive,
        tabBarStyle: styles.tabBar,
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
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.foodTabBar,
    borderTopColor: Colors.foodBorder,
    borderTopWidth: 1,
    height: TAB_BAR_HEIGHT,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 8,
    ...Elevation.sticky,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
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
