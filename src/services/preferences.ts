/**
 * preferences.ts — the customer's saved app preferences
 *
 * Endpoints (see yulo_backend/API.md → "Users — Preferences"):
 *   GET   /api/users/me/preferences  → the full preferences document
 *   PATCH /api/users/me/preferences  → merge-update (server merges; never wipes
 *                                       fields the caller didn't send)
 *
 * Only the veg-mode fields are typed here — everything else on the document
 * (`notifications`, `preferredLanguage`, …) isn't read by this app yet.
 */

import { apiGet, apiPatch } from './api';

export type VegScope = 'all_restaurants' | 'pure_veg_only';

export interface UserPreferences {
  vegModeEnabled: boolean;
  vegModeScope: VegScope;
}

interface PreferencesResponse {
  preferences: UserPreferences;
}

export async function fetchPreferences(): Promise<UserPreferences> {
  const data = await apiGet<PreferencesResponse>('/api/users/me/preferences');
  return {
    vegModeEnabled: data.preferences?.vegModeEnabled ?? false,
    vegModeScope: data.preferences?.vegModeScope ?? 'all_restaurants',
  };
}

export async function updateVegPreference(
  vegModeEnabled: boolean,
  vegModeScope: VegScope,
): Promise<UserPreferences> {
  const data = await apiPatch<PreferencesResponse>('/api/users/me/preferences', {
    vegModeEnabled,
    vegModeScope,
  });
  return {
    vegModeEnabled: data.preferences?.vegModeEnabled ?? vegModeEnabled,
    vegModeScope: data.preferences?.vegModeScope ?? vegModeScope,
  };
}
