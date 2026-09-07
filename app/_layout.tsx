import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BrandSplash from '../src/components/BrandSplash';
import DemoSessionBanner from '../src/components/DemoSessionBanner';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { Colors } from '../src/constants/Colors';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { DeliveryLocationProvider } from '../src/context/DeliveryLocationContext';
import {
  OnboardingProvider,
  useOnboarding,
} from '../src/context/OnboardingContext';
import { VegModeProvider } from '../src/context/VegModeContext';
import { installGlobalErrorLogging, reportError } from '../src/lib/logger';

// Route uncaught JS exceptions through the shared logger before RN's own
// handling — must run before any screen mounts.
installGlobalErrorLogging();

// Prevent the native splash from auto-hiding so we can hand off to <BrandSplash />.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isAuthenticated } = useAuth();
  const { showOnboarding } = useOnboarding();

  // Protected groups swap automatically when the guard flips: signing in reveals
  // (tabs) and navigates to it, signing out falls back to the sign-in screen.
  // Finishing the intro drops `onboarding` and falls through to sign-in.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Without this the navigator paints its own default white between
        // screens, which flashes against the app canvas mid-transition.
        contentStyle: { backgroundColor: Colors.foodBg },
      }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="location" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="address" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="favorites" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="help" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="restaurant/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="checkout" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="item/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="order/[id]/track" options={{ animation: 'slide_from_bottom', headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Protected guard={showOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify-otp" />
      </Stack.Protected>

      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function AppShell() {
  const { ready, showOnboarding } = useOnboarding();
  const { isReady: authReady } = useAuth();

  // Preload the icon font once, up front. @expo/vector-icons otherwise calls
  // Font.loadAsync() from every icon's componentDidMount with no catch, so a
  // screenful of icons fires a burst of concurrent downloads of the same file
  // and any failure surfaces as an unhandled promise rejection.
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  useEffect(() => {
    if (fontError) {
      reportError('root', 'Icon font failed to load', fontError);
    }
  }, [fontError]);

  // Missing icons are a degraded look, not a reason to hold the app hostage.
  const fontsSettled = fontsLoaded || fontError != null;

  const [splashAnimDone, setSplashAnimDone] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const overlayFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // The JS bundle is ready; drop the static native splash and let the
    // animated React splash take over.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => setSplashAnimDone(true), []);

  // Once the persisted flag has loaded, make sure a fresh install lands on the
  // carousel: it is the first screen in the unauthenticated group, but nudge the
  // router in case it is still resting on the sign-in anchor.
  useEffect(() => {
    if (ready && showOnboarding) router.replace('/onboarding');
  }, [ready, showOnboarding]);

  // Reveal the app only once the intro animation has played AND both persisted
  // stores have resolved — the onboarding flag and the saved session — so the
  // first screen (onboarding vs sign-in vs the tabs) never flashes the wrong one.
  useEffect(() => {
    if (!splashAnimDone || !ready || !authReady || !fontsSettled || splashDone) return;
    Animated.timing(overlayFade, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setSplashDone(true));
  }, [splashAnimDone, ready, authReady, fontsSettled, splashDone, overlayFade]);

  return (
    <>
      <VegModeProvider>
        <DeliveryLocationProvider>
          <CartProvider>
            <DemoSessionBanner />
            <RootNavigator />
          </CartProvider>
        </DeliveryLocationProvider>
      </VegModeProvider>

      {!splashDone && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: overlayFade }]}
          pointerEvents="none"
        >
          <BrandSplash onFinish={handleSplashFinish} />
        </Animated.View>
      )}

      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary scope="root">
      <SafeAreaProvider>
        <AuthProvider>
          <OnboardingProvider>
            <AppShell />
          </OnboardingProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
