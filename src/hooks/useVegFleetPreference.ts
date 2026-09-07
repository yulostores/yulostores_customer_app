/**
 * useVegFleetPreference.ts — the single boolean behind the Profile screen's
 * "Veg-fleet preference" toggle.
 *
 * Reads `preferences.vegFleetPreferenceEnabled` from `GET /api/users/me/preferences`
 * and writes it back with a merge `PATCH` (src/services/preferences.ts). Unlike
 * VegModeContext this is not cached on-device: it is a server-account setting
 * with no guest meaning, so a local bypass session reports `available: false`
 * and the screen shows the row disabled.
 *
 * The toggle is optimistic — the switch flips immediately and reverts if the
 * write fails — matching the rest of the app's "local intent wins, server catches
 * up" pattern.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchPreferences, updateVegFleetPreference } from '../services/preferences';

interface UseVegFleetPreferenceResult {
  enabled: boolean;
  /** There is a server account to read/write this on (not a bypass session, load didn't 401). */
  available: boolean;
  /** First read in flight. */
  isLoading: boolean;
  /** A write is in flight. */
  isSaving: boolean;
  setEnabled: (next: boolean) => void;
}

export function useVegFleetPreference(): UseVegFleetPreferenceResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(hasServerToken);
  const [isLoading, setIsLoading] = useState(hasServerToken);
  const [isSaving, setIsSaving] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasServerToken) {
      setAvailable(false);
      setIsLoading(false);
      return;
    }
    let alive = true;
    setIsLoading(true);
    fetchPreferences()
      .then((prefs) => {
        if (!alive) return;
        setEnabledState(prefs.vegFleetPreferenceEnabled);
        setAvailable(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          logger.warn('vegFleet', 'Skipped veg-fleet preference load', {
            code: err.code,
            status: err.status,
          });
        } else {
          reportError('vegFleet', 'Failed to load veg-fleet preference', err);
        }
        if (alive) setAvailable(false);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hasServerToken]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next); // optimistic
      setIsSaving(true);
      updateVegFleetPreference(next)
        .then((prefs) => {
          if (mountedRef.current) setEnabledState(prefs.vegFleetPreferenceEnabled);
        })
        .catch((err) => {
          if (mountedRef.current) setEnabledState(!next); // revert
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            logger.warn('vegFleet', `Could not save veg-fleet preference — ${err.status} ${err.code}`, {
              status: err.status,
              code: err.code,
            });
          } else {
            reportError('vegFleet', 'Failed to save veg-fleet preference', err);
          }
        })
        .finally(() => {
          if (mountedRef.current) setIsSaving(false);
        });
    },
    [],
  );

  return { enabled, available, isLoading, isSaving, setEnabled };
}
