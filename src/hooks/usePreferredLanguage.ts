/**
 * usePreferredLanguage.ts — the code behind the Settings → Language screen.
 *
 * Reads `preferences.preferredLanguage` from `GET /api/users/me/preferences` and
 * writes it back with a merge `PATCH` (src/services/preferences.ts). Like
 * useVegFleetPreference this is a server-account setting with no guest meaning:
 * a local bypass session reports `available: false` and the screen shows the
 * picker gated behind a sign-in prompt.
 *
 * The change is optimistic — the selection moves immediately and reverts if the
 * write fails. Which codes may actually be picked (an `available` language)
 * comes from useAppConfig; the backend rejects anything else with a 400, which
 * the revert covers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchPreferences, updatePreferredLanguage } from '../services/preferences';

interface UsePreferredLanguageResult {
  /** Current language code — 'en' until the account's value loads. */
  code: string;
  /** There is a server account to read/write this on (not a bypass session / 401). */
  available: boolean;
  /** First read in flight. */
  isLoading: boolean;
  /** A write is in flight. */
  isSaving: boolean;
  setCode: (next: string) => void;
}

export function usePreferredLanguage(): UsePreferredLanguageResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [code, setCodeState] = useState('en');
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

  // Latest code, read synchronously when a save needs to know what to revert to.
  const codeRef = useRef(code);
  codeRef.current = code;

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
        setCodeState(prefs.preferredLanguage);
        setAvailable(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          logger.warn('language', 'Skipped preferred-language load', {
            code: err.code,
            status: err.status,
          });
        } else {
          reportError('language', 'Failed to load preferred language', err);
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

  const setCode = useCallback((next: string) => {
    const previous = codeRef.current;
    if (previous === next) return;

    setCodeState(next); // optimistic
    setIsSaving(true);
    updatePreferredLanguage(next)
      .then((prefs) => {
        if (mountedRef.current) setCodeState(prefs.preferredLanguage);
      })
      .catch((err) => {
        if (mountedRef.current) setCodeState(previous); // revert
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('language', `Could not save preferred language — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
        } else {
          reportError('language', 'Failed to save preferred language', err);
        }
      })
      .finally(() => {
        if (mountedRef.current) setIsSaving(false);
      });
  }, []);

  return { code, available, isLoading, isSaving, setCode };
}
