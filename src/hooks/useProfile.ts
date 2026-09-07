/**
 * useProfile.ts — the signed-in customer's account profile for the Profile tab
 * (`app/(tabs)/profile.tsx`).
 *
 * One read of `GET /api/users/me` (src/services/profile.ts). Mirrors useOrders:
 * a mounted guard, a request-id guard so a stale response can't land on fresh
 * state, and the app-wide severity split (`ApiError` 4xx → warn, 5xx /
 * unreachable → reportError).
 *
 * The in-memory session already carries the phone (and sometimes the name) from
 * the OTP verify, so the screen is seeded from it for an instant first paint and
 * the network call only ever *refines* what's shown. A local bypass session has
 * no server account: the fetch is skipped, `notSignedIn` is set, and the seed is
 * all the screen gets.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchMyProfile, type CustomerProfile } from '../services/profile';

interface UseProfileResult {
  profile: CustomerProfile | null;
  /** First load, nothing on screen yet (no session seed and a fetch in flight). */
  isLoading: boolean;
  /** A refetch while a profile is already showing (pull-to-refresh). */
  isRefreshing: boolean;
  error: string | null;
  /** Bypass / expired session — there is no server account to read. */
  notSignedIn: boolean;
  refresh: () => Promise<void>;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function seedFrom(user: ReturnType<typeof useAuth>['user']): CustomerProfile | null {
  if (!user) return null;
  return {
    id: String(user._id),
    name: (user.name ?? '').trim(),
    phone: user.phone?.trim() || null,
    email: user.email?.trim().toLowerCase() || null,
    avatarUrl: null,
    savedAddressCount: 0,
    memberSince: null,
  };
}

export function useProfile(): UseProfileResult {
  const { user, isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [profile, setProfile] = useState<CustomerProfile | null>(() => seedFrom(user));
  const [isLoading, setIsLoading] = useState(hasServerToken && !profile);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(!hasServerToken);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current && requestRef.current === requestId;

    if (!hasServerToken) {
      if (isCurrent()) {
        setNotSignedIn(true);
        setError(null);
        setIsLoading(false);
        setIsRefreshing(false);
        setProfile((prev) => prev ?? seedFrom(user));
      }
      return;
    }

    setNotSignedIn(false);
    setError(null);
    if (loadedOnceRef.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const fresh = await fetchMyProfile();
      if (!isCurrent()) return;
      setProfile(fresh);
      loadedOnceRef.current = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('profile', 'Profile needs a signed-in customer — 401', { code: err.code });
        if (isCurrent()) setNotSignedIn(true);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('profile', `Profile unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) setError(messageFor(err, 'Could not load your profile.'));
      } else {
        reportError('profile', 'Failed to load profile', err);
        if (isCurrent()) setError(messageFor(err, 'Could not load your profile.'));
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [hasServerToken, user]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    profile,
    isLoading,
    isRefreshing,
    error,
    notSignedIn,
    refresh: load,
  };
}
