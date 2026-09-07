/**
 * useNotificationPreferences.ts — the data behind app/notifications.
 *
 * One read of `GET /api/users/me/preferences` (src/services/preferences.ts) for
 * `notifications.pushEnabled` (the master status row) and
 * `notifications.categories` (one switch per row). Follows the app-wide
 * conventions used by useProfile / useVegFleetPreference: a mounted guard, a
 * request-id guard so a stale response can't land on fresh state, the severity
 * split (`ApiError` 401 → not signed in, other 4xx → warn + message, 5xx /
 * unreachable → reportError), and a bypass session reported as `available: false`.
 *
 * The screen edits a local draft of the category switches. `dirty` compares that
 * draft to the last server truth and `save()` PATCHes only the rows that changed
 * — the server upserts them by `key`. `pushEnabled` is read-only here: it mirrors
 * the account flag and the screen deep-links to the OS settings to change it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { categoryMeta, type NotificationCategoryMeta } from '../services/notifications';
import {
  fetchPreferences,
  updateNotificationPreferences,
  type NotificationCategoryPref,
} from '../services/preferences';

/** A category row ready to render — the stored `{ key, enabled }` plus its copy. */
export interface NotificationCategoryRow extends NotificationCategoryMeta {
  key: string;
  enabled: boolean;
}

interface UseNotificationPreferencesResult {
  /** Account master push flag — shown as a status pill, not editable here. */
  pushEnabled: boolean;
  /** The draft rows (server state until the user flips a switch). */
  categories: NotificationCategoryRow[];
  /** There is a server account to read/write this on (not a bypass session / 401). */
  available: boolean;
  /** First read in flight. */
  isLoading: boolean;
  /** A save is in flight. */
  isSaving: boolean;
  /** Load or save failure, in words a user can read. */
  error: string | null;
  /** The draft differs from the last saved state. */
  dirty: boolean;
  /** A save has completed since the last edit (drives the "saved" confirmation). */
  savedOnce: boolean;
  setCategoryEnabled: (key: string, enabled: boolean) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function decorate(list: NotificationCategoryPref[]): NotificationCategoryRow[] {
  return list.map((c) => ({ ...categoryMeta(c.key), key: c.key, enabled: c.enabled }));
}

export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  const [pushEnabled, setPushEnabled] = useState(false);
  const [serverCategories, setServerCategories] = useState<NotificationCategoryPref[]>([]);
  const [draft, setDraft] = useState<NotificationCategoryPref[]>([]);
  const [available, setAvailable] = useState(hasServerToken);
  const [isLoading, setIsLoading] = useState(hasServerToken);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    if (!hasServerToken) {
      if (isCurrent()) {
        setAvailable(false);
        setIsLoading(false);
        setError(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const prefs = await fetchPreferences();
      if (!isCurrent()) return;
      setPushEnabled(prefs.notifications.pushEnabled);
      setServerCategories(prefs.notifications.categories);
      setDraft(prefs.notifications.categories);
      setSavedOnce(false);
      setAvailable(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('notifications', 'Notification preferences need a signed-in customer — 401', {
          code: err.code,
        });
        if (isCurrent()) setAvailable(false);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('notifications', `Notification preferences unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) setError(messageFor(err, 'Could not load your notification settings.'));
      } else {
        reportError('notifications', 'Failed to load notification preferences', err);
        if (isCurrent()) setError(messageFor(err, 'Could not load your notification settings.'));
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [hasServerToken]);

  useEffect(() => {
    load();
  }, [load]);

  const setCategoryEnabled = useCallback((key: string, enabled: boolean) => {
    setSavedOnce(false);
    setError(null);
    setDraft((prev) =>
      prev.some((c) => c.key === key)
        ? prev.map((c) => (c.key === key ? { ...c, enabled } : c))
        : [...prev, { key, enabled }],
    );
  }, []);

  // Only the rows whose `enabled` no longer matches the last saved state.
  const changed = useMemo(() => {
    const savedByKey = new Map(serverCategories.map((c) => [c.key, c.enabled]));
    return draft.filter((c) => savedByKey.get(c.key) !== c.enabled);
  }, [draft, serverCategories]);

  const dirty = changed.length > 0;

  const save = useCallback(async () => {
    if (changed.length === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const prefs = await updateNotificationPreferences({ categories: changed });
      if (!mountedRef.current) return;
      setPushEnabled(prefs.notifications.pushEnabled);
      setServerCategories(prefs.notifications.categories);
      setDraft(prefs.notifications.categories);
      setSavedOnce(true);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('notifications', `Could not save notification preferences — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('notifications', 'Failed to save notification preferences', err);
      }
      if (mountedRef.current) {
        setError(messageFor(err, 'Could not save your changes. Try again.'));
      }
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [changed, isSaving]);

  const categories = useMemo(() => decorate(draft), [draft]);

  return {
    pushEnabled,
    categories,
    available,
    isLoading,
    isSaving,
    error,
    dirty,
    savedOnce,
    setCategoryEnabled,
    save,
    reload: load,
  };
}
