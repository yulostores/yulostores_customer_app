/**
 * session.ts — process-lifetime store for the signed-in customer
 *
 * Deliberately in-memory only: the trial build has no persistence dependency, so
 * a full app restart returns to the login screen. Swap the get/set bodies for
 * `expo-secure-store` later without touching any caller.
 */

import type { AuthUser } from './auth';

export interface Session {
  /** Real backend JWT, or '' when minted locally via the OTP bypass. */
  accessToken: string;
  user: AuthUser;
  /** True when this session did not come from a verified backend login. */
  bypassed: boolean;
}

let current: Session | null = null;
const listeners = new Set<() => void>();

export function getSession(): Session | null {
  return current;
}

export function setSession(next: Session | null): void {
  current = next;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Bearer token for authenticated API calls, or undefined when signed out. */
export function getAccessToken(): string | undefined {
  return current?.accessToken || undefined;
}
