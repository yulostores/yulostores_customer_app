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
 * the revert covers. Rapid taps each send a PATCH; only the latest request's
 * response may touch the selection (a seq ref), so a slow older reply can't
 * overwrite the newer pick.
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
  // Last value the server confirmed — what a failed latest write reverts to
  // (the `previous` optimistic value may itself never have been saved).
  const confirmedRef = useRef(code);
  // Bumped per write; a response whose seq isn't the latest is ignored.
  const saveSeqRef = useRef(0);

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
        confirmedRef.current = prefs.preferredLanguage;
        // A pick made while this read was in flight wins over the stale value.
        if (saveSeqRef.current === 0) setCodeState(prefs.preferredLanguage);
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

    const seq = ++saveSeqRef.current;
    const isLatest = () => mountedRef.current && saveSeqRef.current === seq;

    setCodeState(next); // optimistic
    setIsSaving(true);
    updatePreferredLanguage(next)
      .then((prefs) => {
        if (!isLatest()) return;
        confirmedRef.current = prefs.preferredLanguage;
        setCodeState(prefs.preferredLanguage);
      })
      .catch((err) => {
        if (isLatest()) setCodeState(confirmedRef.current); // revert
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
        if (isLatest()) setIsSaving(false);
      });
  }, []);

  return { code, available, isLoading, isSaving, setCode };
}
