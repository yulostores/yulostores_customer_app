/**
 * OnboardingContext — tracks whether the intro carousel has been seen.
 *
 * The root layout reads `showOnboarding` to gate the `onboarding` route in the
 * unauthenticated stack; the onboarding screen calls `complete()` when the user
 * finishes or skips. The flag is persisted so the carousel only shows once per
 * install. `ready` is false until the persisted value has been read — the root
 * layout keeps the splash up until then so no screen flashes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { logger } from '../lib/logger';

const STORAGE_KEY = '@yulo/onboarding_complete';

interface OnboardingContextValue {
  /** True once the persisted flag has loaded (regardless of its value). */
  ready: boolean;
  /** True when the carousel should be shown (loaded + not yet completed). */
  showOnboarding: boolean;
  /** Mark the carousel as done and persist it. */
  complete: () => Promise<void>;
  /** Clear the flag — handy for QA / a "replay intro" action. */
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (active) setCompleted(value === '1');
      })
      .catch((err) => {
        // Storage unavailable — treat as "not seen" so the intro still runs.
        logger.warn('onboarding', 'Could not read onboarding flag', {
          reason: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(async () => {
    setCompleted(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, '1');
    } catch (err) {
      // Non-fatal: the flag stays in memory for this session, so the carousel
      // may reappear on the next launch.
      logger.warn('onboarding', 'Could not persist onboarding-complete flag', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const reset = useCallback(async () => {
    setCompleted(false);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      logger.warn('onboarding', 'Could not clear onboarding flag', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ready,
      showOnboarding: ready && !completed,
      complete,
      reset,
    }),
    [ready, completed, complete, reset],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  }
  return ctx;
}
