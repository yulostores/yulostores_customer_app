import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="language" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="payment-methods" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/[doc]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
