/**
 * preferences.ts — the customer's saved app preferences
 *
 * Endpoints (see yulo_backend/API.md → "Users — Preferences"):
 *   GET   /api/users/me/preferences  → the full preferences document
 *   PATCH /api/users/me/preferences  → merge-update (server merges; never wipes
 *                                       fields the caller didn't send)
 *
 * This file is the single owner of that endpoint. The veg-related fields, the
 * `notifications` block and `preferredLanguage` are typed and reshaped here;
 * anything else on the document isn't read by this app yet.
 *
 * `preferredLanguage` is the customer's chosen UI language code (e.g. "en"). The
 * catalogue of codes it may hold — and which are actually selectable — comes
 * from GET /api/app/config (src/services/appConfig.ts); the Settings → Language
 * screen is the only thing that writes it.
 *
 * `vegFleetPreferenceEnabled` is a separate flag from `vegModeEnabled`: it is
 * the customer's default answer to the per-order "use a veg-only delivery
 * fleet?" checkout choice, not a menu-content filter. The Profile screen's
 * "Veg-fleet preference" toggle is the only thing that reads/writes it.
 *
 * `notifications` drives app/notifications: `pushEnabled` is the master status
 * row, `categories` is one switch per row. The wire shape of a category is just
 * `{ key, enabled }` — the human label/blurb lives in src/services/notifications.ts.
 */

import { apiGet, apiPatch } from './api';

export type VegScope = 'all_restaurants' | 'pure_veg_only';

/** One toggleable notification category as stored on the account. */
export interface NotificationCategoryPref {
  key: string;
  enabled: boolean;
}

export interface NotificationPreferences {
  /** The account's master push flag (mirrors the OS-level permission). */
  pushEnabled: boolean;
  /** Server order preserved — the screen renders these rows as-is. */
  categories: NotificationCategoryPref[];
}

export interface UserPreferences {
  vegModeEnabled: boolean;
  vegModeScope: VegScope;
  vegFleetPreferenceEnabled: boolean;
  /** UI language code, e.g. "en". Defaults to "en" when the account has none. */
  preferredLanguage: string;
  notifications: NotificationPreferences;
}

interface RawNotificationCategory {
  key?: string;
  enabled?: boolean;
}

interface RawNotifications {
  pushEnabled?: boolean;
  categories?: (RawNotificationCategory | null)[] | null;
}

interface RawPreferences {
  vegModeEnabled?: boolean;
  vegModeScope?: VegScope;
  vegFleetPreferenceEnabled?: boolean;
  preferredLanguage?: string;
  notifications?: RawNotifications | null;
}

interface PreferencesResponse {
  preferences: RawPreferences;
}

function reshapeNotifications(n: RawNotifications | null | undefined): NotificationPreferences {
  const rawCategories = Array.isArray(n?.categories) ? n!.categories : [];
  const categories = rawCategories
    .filter(
      (c): c is RawNotificationCategory =>
        !!c && typeof c.key === 'string' && c.key.length > 0,
    )
    // A category's `enabled` defaults to true on the backend schema — mirror that
    // for a row that somehow arrives without the flag.
    .map((c) => ({ key: c.key as string, enabled: c.enabled !== false }));

  return {
    pushEnabled: n?.pushEnabled ?? false,
    categories,
  };
}

function reshape(p: RawPreferences | undefined): UserPreferences {
  return {
    vegModeEnabled: p?.vegModeEnabled ?? false,
    vegModeScope: p?.vegModeScope ?? 'all_restaurants',
    vegFleetPreferenceEnabled: p?.vegFleetPreferenceEnabled ?? false,
    preferredLanguage: p?.preferredLanguage?.trim() || 'en',
    notifications: reshapeNotifications(p?.notifications),
  };
}

export async function fetchPreferences(): Promise<UserPreferences> {
  const data = await apiGet<PreferencesResponse>('/api/users/me/preferences');
  return reshape(data.preferences);
}

export async function updateVegPreference(
  vegModeEnabled: boolean,
  vegModeScope: VegScope,
): Promise<UserPreferences> {
  const data = await apiPatch<PreferencesResponse>('/api/users/me/preferences', {
    vegModeEnabled,
    vegModeScope,
  });
  // The server merges and echoes the whole document back; fall back to what we
  // just sent only if a field is somehow missing from the response.
  return {
    ...reshape(data.preferences),
    vegModeEnabled: data.preferences?.vegModeEnabled ?? vegModeEnabled,
    vegModeScope: data.preferences?.vegModeScope ?? vegModeScope,
  };
}

/**
 * Set the "use a veg-only delivery fleet by default" flag. Merge-updates just
 * this field — `vegModeEnabled` / `vegModeScope` are untouched.
 */
export async function updateVegFleetPreference(
  vegFleetPreferenceEnabled: boolean,
): Promise<UserPreferences> {
  const data = await apiPatch<PreferencesResponse>('/api/users/me/preferences', {
    vegFleetPreferenceEnabled,
  });
  return {
    ...reshape(data.preferences),
    vegFleetPreferenceEnabled:
      data.preferences?.vegFleetPreferenceEnabled ?? vegFleetPreferenceEnabled,
  };
}

/**
 * Set the customer's UI language. Merge-updates just `preferredLanguage`. The
 * backend rejects a code the app doesn't ship strings for (`400
 * VALIDATION_ERROR`) — pass only a `code` whose `available` is true in
 * GET /api/app/config.
 */
export async function updatePreferredLanguage(code: string): Promise<UserPreferences> {
  const data = await apiPatch<PreferencesResponse>('/api/users/me/preferences', {
    preferredLanguage: code,
  });
  return {
    ...reshape(data.preferences),
    preferredLanguage: data.preferences?.preferredLanguage?.trim() || code,
  };
}

/**
 * Merge-update the `notifications` block. Callers send only what changed: a
 * `categories` array is upserted by `key` server-side (yulo_backend
 * services/user.service.js), so passing just the toggled rows is enough and
 * never wipes the ones left out. The server echoes the whole document back.
 */
export async function updateNotificationPreferences(patch: {
  pushEnabled?: boolean;
  categories?: NotificationCategoryPref[];
}): Promise<UserPreferences> {
  const data = await apiPatch<PreferencesResponse>('/api/users/me/preferences', {
    notifications: patch,
  });
  return reshape(data.preferences);
}
