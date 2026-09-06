import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/Colors';

/**
 * The "Where should we deliver to?" flow:
 *   index   → permission / entry (replicates the design)
 *   search  → free-text address search
 *   map     → drag-the-map picker with live reverse geocoding
 *   confirm → flat / floor / label details, then save
 *
 * Lives inside the authenticated stack (see app/_layout.tsx) because it writes
 * to the customer's saved addresses.
 */
export default function LocationLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.foodBg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="search" options={{ animation: 'fade' }} />
      <Stack.Screen name="map" />
      <Stack.Screen name="confirm" />
    </Stack>
  );
}
