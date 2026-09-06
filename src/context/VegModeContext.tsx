/**
 * VegModeContext — the "VEG Only" switch shown on Home.
 *
 * Two independent bits, mirroring the backend's own `preferences.vegModeEnabled`
 * / `preferences.vegModeScope` (see yulo_backend/server/models/User.js):
 *  - `enabled`  — filter menu content app-wide to vegetarian only.
 *  - `scope`    — when enabled, whether that also excludes restaurants that
 *                 aren't 100% vegetarian ('pure_veg_only') or leaves every
 *                 restaurant in with just its veg dishes ('all_restaurants').
 *
 * Cached in AsyncStorage so the choice survives a restart even for a guest /
 * OTP-bypass session with no server account. With a real customer token it
 * also syncs to `/api/users/me/preferences`, the same best-effort pattern as
 * {@link DeliveryLocationContext} — the local toggle always wins immediately;
 * the server write is fire-and-forget.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  fetchPreferences,
  updateVegPreference,
  type VegScope,
} from '../services/preferences';
import { useAuth } from './AuthContext';

export type { VegScope };

const STORAGE_KEY = 'yulo.vegMode.v1';

interface StoredVegMode {
  enabled: boolean;
  scope: VegScope;
}

interface VegModeValue {
  enabled: boolean;
  scope: VegScope;
  /** AsyncStorage read finished — safe to trust `enabled`/`scope` for a first fetch. */
  hydrated: boolean;
  /** Turn veg-only mode on/off, optionally narrowing scope in the same call. */
  setEnabled: (enabled: boolean, scope?: VegScope) => void;
  /** Change scope without touching whether veg mode is on at all. */
  setScope: (scope: VegScope) => void;
}

const Ctx = createContext<VegModeValue | null>(null);

export function VegModeProvider({ children }: PropsWithChildren) {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken = isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [enabled, setEnabledState] = useState(false);
  const [scope, setScopeState] = useState<VegScope>('all_restaurants');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the cached preference once on mount.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw) as StoredVegMode;
        setEnabledState(!!parsed.enabled);
        setScopeState(parsed.scope === 'pure_veg_only' ? 'pure_veg_only' : 'all_restaurants');
      })
      .catch((err) => {
        logger.warn('vegMode', 'Could not read cached veg preference', {
          reason: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: StoredVegMode) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      logger.warn('vegMode', 'Could not persist veg preference', {
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  }, []);

  // A real account's saved preference is the source of truth once we can reach
  // it — pull it in whenever we gain a server session, same as saved addresses.
  useEffect(() => {
    if (!hasServerToken) return;
    let alive = true;
    fetchPreferences()
      .then((prefs) => {
        if (!alive) return;
        setEnabledState(prefs.vegModeEnabled);
        setScopeState(prefs.vegModeScope);
        persist({ enabled: prefs.vegModeEnabled, scope: prefs.vegModeScope });
      })
      .catch((err) => {
        // Offline / 401 on a stale token — keep whatever the cache already has.
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          logger.warn('vegMode', 'Skipped veg preference refresh', {
            code: err.code,
            status: err.status,
          });
        } else {
          reportError('vegMode', 'Failed to load veg preference', err);
        }
      });
    return () => {
      alive = false;
    };
  }, [hasServerToken, persist]);

  // Best-effort push to the server; never blocks the switch itself.
  const syncRef = useRef(hasServerToken);
  syncRef.current = hasServerToken;
  const pushToServer = useCallback((next: StoredVegMode) => {
    if (!syncRef.current) return;
    updateVegPreference(next.enabled, next.scope).catch((err) => {
      logger.warn('vegMode', 'Could not sync veg preference to server', {
        reason: err instanceof ApiError ? err.code : 'unknown',
      });
    });
  }, []);

  const setEnabled = useCallback(
    (nextEnabled: boolean, nextScope?: VegScope) => {
      const resolvedScope = nextScope ?? scope;
      setEnabledState(nextEnabled);
      if (nextScope) setScopeState(nextScope);
      const next = { enabled: nextEnabled, scope: resolvedScope };
      persist(next);
      pushToServer(next);
    },
    [scope, persist, pushToServer],
  );

  const setScope = useCallback(
    (nextScope: VegScope) => {
      setScopeState(nextScope);
      const next = { enabled, scope: nextScope };
      persist(next);
      pushToServer(next);
    },
    [enabled, persist, pushToServer],
  );

  const value = useMemo<VegModeValue>(
    () => ({ enabled, scope, hydrated, setEnabled, setScope }),
    [enabled, scope, hydrated, setEnabled, setScope],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVegMode(): VegModeValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useVegMode must be used inside <VegModeProvider>');
  }
  return ctx;
}
