import { Stack } from 'expo-router';

export default function HelpLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="requests" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="new" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
