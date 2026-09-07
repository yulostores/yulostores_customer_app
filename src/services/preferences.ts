/**
 * preferences.ts — the customer's saved app preferences
 *
 * Endpoints (see yulo_backend/API.md → "Users — Preferences"):
 *   GET   /api/users/me/preferences  → the full preferences document
 *   PATCH /api/users/me/preferences  → merge-update (server merges; never wipes
 *                                       fields the caller didn't send)
 *
 * Only the veg-related fields are typed here — everything else on the document
 * (`notifications`, `preferredLanguage`, …) isn't read by this app yet.
 *
 * `vegFleetPreferenceEnabled` is a separate flag from `vegModeEnabled`: it is
 * the customer's default answer to the per-order "use a veg-only delivery
 * fleet?" checkout choice, not a menu-content filter. The Profile screen's
 * "Veg-fleet preference" toggle is the only thing that reads/writes it.
 */

import { apiGet, apiPatch } from './api';

export type VegScope = 'all_restaurants' | 'pure_veg_only';

export interface UserPreferences {
  vegModeEnabled: boolean;
  vegModeScope: VegScope;
  vegFleetPreferenceEnabled: boolean;
}

interface RawPreferences {
  vegModeEnabled?: boolean;
  vegModeScope?: VegScope;
  vegFleetPreferenceEnabled?: boolean;
}

interface PreferencesResponse {
  preferences: RawPreferences;
}

function reshape(p: RawPreferences | undefined): UserPreferences {
  return {
    vegModeEnabled: p?.vegModeEnabled ?? false,
    vegModeScope: p?.vegModeScope ?? 'all_restaurants',
    vegFleetPreferenceEnabled: p?.vegFleetPreferenceEnabled ?? false,
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
