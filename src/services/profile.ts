/**
 * profile.ts — the signed-in customer's account profile.
 *
 * One read: `GET /api/users/me` (yulo_backend/API.md → "Customer — Profile").
 * Everything the Profile screen shows — name, phone, avatar, saved-address
 * count, "member since" — is reshaped here into a flat view type so the screen
 * renders no wire field directly and invents none of them.
 *
 * Customer-token-only: the whole `/api/users` router sits behind `authenticate`
 * (yulo_backend/server/routes/user.routes.js). A local OTP-bypass session has no
 * real token and 401s here — {@link useProfile} falls back to the phone already
 * on the in-memory session instead.
 */

import { apiGet } from './api';

interface RawUser {
  _id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  profilePicture?: string | null;
  savedAddresses?: unknown[];
  createdAt?: string | null;
}

/** The flat shape the Profile screen renders. */
export interface CustomerProfile {
  id: string;
  /** Trimmed account name, or '' when the customer has never set one. */
  name: string;
  /** Phone as stored ("+919876543210"), or null. */
  phone: string | null;
  email: string | null;
  /** Cloudinary avatar URL, or null — the screen shows initials instead. */
  avatarUrl: string | null;
  savedAddressCount: number;
  /** ISO date the account was created, or null on older rows. */
  memberSince: string | null;
}

function reshape(u: RawUser): CustomerProfile {
  return {
    id: String(u._id),
    name: (u.name ?? '').trim(),
    phone: u.phone?.trim() || null,
    email: u.email?.trim().toLowerCase() || null,
    avatarUrl: u.profilePicture?.trim() || null,
    savedAddressCount: Array.isArray(u.savedAddresses) ? u.savedAddresses.length : 0,
    memberSince: u.createdAt ?? null,
  };
}

/** The current customer's profile. Throws `ApiError` 401 on a bypass session. */
export async function fetchMyProfile(): Promise<CustomerProfile> {
  const data = await apiGet<{ user: RawUser }>('/api/users/me');
  return reshape(data.user);
}

// ─── Display helpers ──────────────────────────────────────────────────────

/**
 * Turn a stored phone into the grouped form the design shows
 * ("+91 98765 43210"). Handles both the E.164 the backend stores and the bare
 * 10-digit string a local bypass session keeps. Anything else is returned as-is.
 */
export function formatPhone(phone: string): string {
  const trimmed = phone.trim();
  const withCode = trimmed.match(/^\+91(\d{10})$/);
  const bare = trimmed.match(/^(\d{10})$/);
  const ten = withCode?.[1] ?? bare?.[1];
  return ten ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : trimmed;
}

/**
 * What to show as the customer's name. Falls back to the formatted phone, then
 * to a neutral label — never an empty string, never a placeholder name.
 */
export function displayName(p: Pick<CustomerProfile, 'name' | 'phone'>): string {
  if (p.name) return p.name;
  if (p.phone) return formatPhone(p.phone);
  return 'Your account';
}

/**
 * One or two initials for the avatar circle, from the account name. Empty string
 * when there is no name — the screen draws a person icon in that case rather
 * than a meaningless glyph.
 */
export function initialsFor(p: Pick<CustomerProfile, 'name'>): string {
  const name = p.name.trim();
  if (!name) return '';
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "Member since Jan 2026", or null when the join date is unknown / unparseable. */
export function memberSinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `Member since ${d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
}
