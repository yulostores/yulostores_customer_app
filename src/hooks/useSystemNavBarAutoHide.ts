/**
 * useSystemNavBarAutoHide — dims the phone's own navigation bar after a short idle.
 *
 * This is the *device* navigation bar (Android's back / home / recents strip at
 * the very bottom of the screen), not the app's bottom tab bar. The app tab bar
 * is a permanent fixture and never hides — see `app/(tabs)/_layout.tsx`.
 *
 * On a fresh foreground we let the bar sit visible for {@link HIDE_DELAY_MS}, then
 * hide it. `NavigationBar.setHidden(true)` also switches Android into
 * `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`: a swipe from the bottom edge brings the
 * bar back *transiently* and the system slides it away again on its own, so we
 * never have to chase the reveal — we only re-arm the timer each time the app
 * returns to the foreground (coming back from background can restore the bar).
 *
 * Android-only. `expo-navigation-bar` is a no-op elsewhere (it just warns), so we
 * skip it entirely on iOS.
 */

import { NavigationBar } from 'expo-navigation-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/** How long the device nav bar stays visible after each foreground before hiding. */
const HIDE_DELAY_MS = 3000;

export function useSystemNavBarAutoHide(): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const clearTimer = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    // Show the bar now, then hide it once the grace period elapses.
    const arm = () => {
      clearTimer();
      NavigationBar.setHidden(false);
      timer.current = setTimeout(() => {
        timer.current = null;
        NavigationBar.setHidden(true);
      }, HIDE_DELAY_MS);
    };

    arm();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') arm();
      else clearTimer();
    });

    return () => {
      clearTimer();
      sub.remove();
    };
  }, []);
}
