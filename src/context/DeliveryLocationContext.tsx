/**
 * DeliveryLocationContext — the delivery address the whole app reads.
 *
 * Holds one `activeLocation` (shown in the "Deliver to" bar, sent at checkout)
 * plus the customer's `savedAddresses`. The active location is cached in
 * AsyncStorage so a returning customer keeps their choice across launches.
 *
 * Saving is best-effort: with a real customer token it POSTs to
 * `/api/users/me/addresses`; with only a local OTP-bypass session (or no
 * network) the address still becomes active, flagged `syncPending`, so the
 * flow never dead-ends.
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
import { hasUsablePoint } from '../lib/address';
import { DEFAULT_REGION, fromGeoJSON } from '../lib/geo';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  createAddress,
  fetchSavedAddresses,
  setDefaultAddress,
} from '../services/addresses';
import { useAuth } from './AuthContext';
import type { ActiveLocation, AddressPayload, SavedAddress } from '../types/address';

const STORAGE_KEY = 'yulo.activeLocation.v1';

// ─── Derivations ───────────────────────────────────────────────────────────

const joinParts = (parts: Array<string | undefined | null>) =>
  parts.map((p) => p?.trim()).filter(Boolean).join(', ');

/**
 * A saved address as the "Deliver to" bar and every geo-scoped fetch read it.
 *
 * `unlocated` is the part that matters. These used to fall back to {@link DEFAULT_REGION}
 * (New Delhi) whenever `location?.coordinates` was missing — and the truthiness check let
 * an EMPTY array through, which is exactly what the server stored for an address whose
 * geocode failed. `fromGeoJSON([])` then produced `{ latitude: undefined, longitude:
 * undefined }`, which was cached as the active location: the home feed requires lat/lng, so
 * it never fetched, and the customer sat on "choose a delivery location" with one already
 * chosen. A New Delhi fallback would not have been better — it would have shown a customer
 * in Ranchi a feed of Delhi restaurants they cannot order from.
 *
 * So an address with no usable point is now marked as such and carries no coordinates, and
 * the screens that need a point say so instead of loading nothing.
 */
export function activeFromSaved(a: SavedAddress): ActiveLocation {
  const located = hasUsablePoint(a);
  return {
    id: a._id,
    label: a.label,
    customLabel: a.customLabel ?? null,
    line: joinParts([a.street, a.city]) || 'Saved address',
    sublocality: joinParts([a.area, a.city, a.state, a.pincode]) || undefined,
    coordinates: located
      ? fromGeoJSON(a.location!.coordinates as [number, number])
      : DEFAULT_REGION,
    unlocated: !located,
    pincode: a.pincode,
  };
}

function activeFromPayload(p: AddressPayload, opts: { syncPending: boolean }): ActiveLocation {
  const located = hasUsablePoint(p);
  return {
    id: null,
    label: p.label,
    customLabel: p.customLabel ?? null,
    line: joinParts([p.street, p.city]) || 'Selected location',
    sublocality: joinParts([p.area, p.city, p.state, p.pincode]) || undefined,
    coordinates: located ? fromGeoJSON(p.location!.coordinates) : DEFAULT_REGION,
    unlocated: !located,
    pincode: p.pincode,
    syncPending: opts.syncPending,
  };
}

// ─── Context ───────────────────────────────────────────────────────────────

interface DeliveryLocationValue {
  activeLocation: ActiveLocation | null;
  savedAddresses: SavedAddress[];
  /** AsyncStorage read finished — safe to decide whether to force the picker. */
  hydrated: boolean;
  loadingSaved: boolean;
  setActiveLocation: (loc: ActiveLocation) => void;
  chooseSaved: (a: SavedAddress) => void;
  refreshSaved: () => Promise<void>;
  /**
   * Persist a new address. Resolves with `synced: false` when it could only be
   * kept on-device (no server session / offline) — the address is still active.
   */
  saveAddress: (
    payload: AddressPayload,
  ) => Promise<{ synced: boolean; location: ActiveLocation }>;
}

const Ctx = createContext<DeliveryLocationValue | null>(null);

export function DeliveryLocationProvider({ children }: PropsWithChildren) {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken = isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [activeLocation, setActive] = useState<ActiveLocation | null>(null);
  const [savedAddresses, setSaved] = useState<SavedAddress[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Hydrate the cached active location once on mount.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (alive && raw) setActive(JSON.parse(raw) as ActiveLocation);
      })
      .catch((err) => {
        // Corrupt cache or storage unavailable — start with no active location.
        logger.warn('location', 'Could not read cached active location', {
          reason: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((loc: ActiveLocation | null) => {
    setActive(loc);
    const write = loc
      ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
      : AsyncStorage.removeItem(STORAGE_KEY);
    write.catch((err) => {
      // In-memory state is still correct; it just won't survive a restart.
      logger.warn('location', 'Could not persist active location', {
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  }, []);

  const setActiveLocation = useCallback(
    (loc: ActiveLocation) => persist(loc),
    [persist],
  );

  const chooseSaved = useCallback(
    (a: SavedAddress) => persist(activeFromSaved(a)),
    [persist],
  );

  const refreshSaved = useCallback(async () => {
    if (!hasServerToken) {
      setSaved([]);
      return;
    }
    setLoadingSaved(true);
    try {
      setSaved(await fetchSavedAddresses());
    } catch (err) {
      // 401 / offline — leave whatever we had. A 401 on a bypass session is
      // expected; anything else is worth a developer's attention.
      if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
        logger.warn('location', 'Skipped saved-address refresh', { code: err.code, status: err.status });
      } else {
        reportError('location', 'Failed to refresh saved addresses', err);
      }
    } finally {
      setLoadingSaved(false);
    }
  }, [hasServerToken]);

  // Pull the saved list whenever we gain a real server session.
  const refreshRef = useRef(refreshSaved);
  refreshRef.current = refreshSaved;
  useEffect(() => {
    if (hasServerToken) refreshRef.current();
    else setSaved([]);
  }, [hasServerToken]);

  const saveAddress = useCallback<DeliveryLocationValue['saveAddress']>(
    async (payload) => {
      if (hasServerToken) {
        try {
          let list = await createAddress(payload);
          // `createAddress` makes the first-ever address default automatically;
          // otherwise honour an explicit isDefault.
          const created =
            list.find((a) => a.isDefault && payload.isDefault) ??
            list[list.length - 1] ??
            null;
          if (created && payload.isDefault && !created.isDefault) {
            list = await setDefaultAddress(created._id).catch((err) => {
              // The address was still created — only the default flag didn't stick.
              logger.warn('location', 'Could not mark new address as default', {
                id: created._id,
                reason: err instanceof ApiError ? err.code : 'unknown',
              });
              return list;
            });
          }
          setSaved(list);
          const chosen = created ?? list[list.length - 1];
          const loc = chosen
            ? activeFromSaved(chosen)
            : activeFromPayload(payload, { syncPending: false });
          persist(loc);
          return { synced: true, location: loc };
        } catch (err) {
          // Fall through to a local save on auth/network errors; rethrow a
          // genuine validation error so the form can show it.
          if (err instanceof ApiError && err.status !== 401 && err.status !== 0) {
            reportError('location', 'Address save rejected by server', err, {
              status: err.status,
              code: err.code,
            });
            throw err;
          }
          logger.warn('location', 'Address saved on-device only (server unreachable / no session)', {
            reason: err instanceof ApiError ? err.code : 'unknown',
          });
        }
      }
      const loc = activeFromPayload(payload, { syncPending: true });
      persist(loc);
      return { synced: false, location: loc };
    },
    [hasServerToken, persist],
  );

  const value = useMemo<DeliveryLocationValue>(
    () => ({
      activeLocation,
      savedAddresses,
      hydrated,
      loadingSaved,
      setActiveLocation,
      chooseSaved,
      refreshSaved,
      saveAddress,
    }),
    [
      activeLocation,
      savedAddresses,
      hydrated,
      loadingSaved,
      setActiveLocation,
      chooseSaved,
      refreshSaved,
      saveAddress,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeliveryLocation(): DeliveryLocationValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useDeliveryLocation must be used inside <DeliveryLocationProvider>');
  }
  return ctx;
}
