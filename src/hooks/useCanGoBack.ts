/**
 * useCanGoBack — is there anywhere to go *back* to from this screen?
 *
 * Needed by the screens that live in `(tabs)` but are also pushed onto the root
 * stack from elsewhere — the cart (from a restaurant, from checkout) and order
 * history (from Profile). Reached by a tab press they are a root destination and
 * a back arrow in their header is meaningless; reached by a push it is the only
 * way out. The arrow therefore has to follow the actual navigation state.
 *
 * `router.canGoBack()` is a plain read of that state, not a subscription, so it
 * is paired with `useIsFocused()` — a screen re-renders whenever its focus
 * flips, which is exactly when the answer can have changed (a tab switch, a
 * push, a pop). An unfocused screen isn't on screen, so the `false` it reports
 * in the meantime is never seen.
 *
 * Both come from `expo-router`, never from `@react-navigation/*`: since SDK 56
 * expo-router vendors its own navigation core and the Metro bundler hard-fails
 * on a direct react-navigation import.
 */

import { router, useIsFocused } from 'expo-router';

export function useCanGoBack(): boolean {
  const isFocused = useIsFocused();
  return isFocused && router.canGoBack();
}
