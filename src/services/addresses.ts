/**
 * addresses.ts — the customer's saved delivery addresses.
 *
 * Backend: yulo_backend/API.md → "Customer — Profile". Every write returns the
 * whole `savedAddresses` array, so callers replace their copy in place rather
 * than re-fetching the profile.
 *
 * All routes need a real customer bearer token. When the app only has a local
 * (OTP-bypass) session these calls throw `ApiError` 401 — the location context
 * catches that and keeps the address on-device instead.
 */

import type { AddressPayload, SavedAddress } from '../types/address';
import { apiDelete, apiGet, apiPatch, apiPost } from './api';

interface AddressesData {
  savedAddresses: SavedAddress[];
}

/** Saved addresses from the profile (`GET /api/users/me`). */
export async function fetchSavedAddresses(): Promise<SavedAddress[]> {
  const data = await apiGet<{ user?: { savedAddresses?: SavedAddress[] } }>('/api/users/me');
  return data.user?.savedAddresses ?? [];
}

export async function createAddress(payload: AddressPayload): Promise<SavedAddress[]> {
  const data = await apiPost<AddressesData>('/api/users/me/addresses', payload);
  return data.savedAddresses ?? [];
}

export async function updateAddress(
  id: string,
  payload: Partial<AddressPayload>,
): Promise<SavedAddress[]> {
  const data = await apiPatch<AddressesData>(`/api/users/me/addresses/${id}`, payload);
  return data.savedAddresses ?? [];
}

export async function setDefaultAddress(id: string): Promise<SavedAddress[]> {
  const data = await apiPatch<AddressesData>(`/api/users/me/addresses/${id}/default`);
  return data.savedAddresses ?? [];
}

export async function removeAddress(id: string): Promise<void> {
  await apiDelete<null>(`/api/users/me/addresses/${id}`);
}
