import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Colors } from '../../src/constants/Colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.foodTabActive,
        tabBarInactiveTintColor: Colors.foodTabInactive,
        tabBarStyle: {
          backgroundColor: Colors.foodTabBar,
          borderTopColor: Colors.foodBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
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
                  { tintColor: focused ? Colors.foodAccent : Colors.foodTabInactive },
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
  scanIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIcon: {
    width: 26,
    height: 26,
  },
});
