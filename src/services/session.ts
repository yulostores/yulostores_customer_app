/**
 * session.ts — persisted store for the signed-in customer
 *
 * The live session is held in a module variable so every getter stays
 * synchronous; it is also mirrored to `expo-secure-store` so a full app restart
 * restores it instead of dropping the customer back on the OTP screen.
 *
 * Persistence is best-effort, exactly like the AsyncStorage caches in
 * OnboardingContext / CartContext: the in-memory value always wins immediately,
 * the disk write is fire-and-forget, and a failure is logged — never surfaced.
 * Call {@link hydrateSession} once at startup (AuthProvider) before reporting
 * `isReady`.
 *
 * Tokens are split across their own keys: SecureStore values have historically
 * been capped near 2 KB on iOS, and two JWTs plus the user object can approach
 * that as a single blob.
 */

import * as SecureStore from 'expo-secure-store';
import { logger } from '../lib/logger';
import type { AuthUser } from './auth';

export interface Session {
  /** Real backend JWT, or '' when minted locally via the OTP bypass. */
  accessToken: string;
  /** Backend refresh JWT (7-day), or '' for a bypass / offline session. */
  refreshToken: string;
  user: AuthUser;
  /** True when this session did not come from a verified backend login. */
  bypassed: boolean;
}

const KEY_ACCESS = 'yulo.session.access';
const KEY_REFRESH = 'yulo.session.refresh';
const KEY_META = 'yulo.session.meta';

let current: Session | null = null;
const listeners = new Set<() => void>();

export function getSession(): Session | null {
  return current;
}

export function setSession(next: Session | null): void {
  current = next;
  listeners.forEach((fn) => fn());
  persist(next);
}

/** Swap just the access token (after a successful refresh), keeping the rest. */
export function setAccessToken(token: string): void {
  if (!current) return;
  setSession({ ...current, accessToken: token });
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

// ─── Persistence ───────────────────────────────────────────────────────────

/** Write one key, or clear it when the value is empty — keeps a bypass session
 *  (no tokens) from depending on how the native store treats an empty string. */
function put(key: string, value: string): Promise<void> {
  return value
    ? SecureStore.setItemAsync(key, value)
    : SecureStore.deleteItemAsync(key);
}

/** Fire-and-forget mirror of the live session to secure storage. */
function persist(next: Session | null): void {
  const task = next
    ? Promise.all([
        put(KEY_ACCESS, next.accessToken),
        put(KEY_REFRESH, next.refreshToken),
        put(KEY_META, JSON.stringify({ user: next.user, bypassed: next.bypassed })),
      ])
    : Promise.all([
        SecureStore.deleteItemAsync(KEY_ACCESS),
        SecureStore.deleteItemAsync(KEY_REFRESH),
        SecureStore.deleteItemAsync(KEY_META),
      ]);

  task.catch((err) => {
    logger.warn('session', 'Could not persist session', {
      reason: err instanceof Error ? err.message : String(err),
    });
  });
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AuthUser)._id === 'string' &&
    typeof (value as AuthUser).role === 'string'
  );
}

/**
 * Load the persisted session into memory. Returns it (also for AuthProvider to
 * seed its state), or `null` when there is nothing stored or the stored data is
 * unusable — in which case the keys are cleared so a bad write can't wedge every
 * future launch. Does not notify subscribers or re-persist.
 */
export async function hydrateSession(): Promise<Session | null> {
  try {
    const [accessToken, refreshToken, metaRaw] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_META),
    ]);

    if (metaRaw == null) return null;

    const meta = JSON.parse(metaRaw) as { user?: unknown; bypassed?: unknown };
    if (!isAuthUser(meta.user)) {
      throw new Error('stored session meta is missing a valid user');
    }

    current = {
      accessToken: accessToken ?? '',
      refreshToken: refreshToken ?? '',
      user: meta.user,
      bypassed: meta.bypassed === true,
    };
    return current;
  } catch (err) {
    logger.warn('session', 'Discarding unreadable persisted session', {
      reason: err instanceof Error ? err.message : String(err),
    });
    persist(null);
    return null;
  }
}
