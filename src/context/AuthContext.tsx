/**
 * AuthContext — exposes the current session to the router and screens.
 *
 * The root layout reads `isAuthenticated` to pick the protected stack
 * (`<Stack.Protected guard={...}>`); screens call `signIn` / `signOut`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { destroySocket } from '../lib/socket';
import { apiSend } from '../services/api';
import { requestGuestSession, type VerifyResult } from '../services/auth';
import {
  getSession,
  hydrateSession,
  setSession,
  subscribe,
  type Session,
} from '../services/session';

interface AuthContextValue {
  session: Session | null;
  user: Session['user'] | null;
  isAuthenticated: boolean;
  /**
   * A real, backend-issued session with `role: 'guest'` (see "Continue as guest"
   * on sign-in.tsx) — authenticated enough to browse, cart and favorite things,
   * but not a real account. Checkout, orders, reviews and support all reject it;
   * screens use this to show their own sign-in prompt instead of even trying.
   */
  isGuest: boolean;
  /** False until the persisted session has been read from secure storage. */
  isReady: boolean;
  signIn: (result: VerifyResult) => void;
  /** Starts an anonymous guest session. Throws on failure — same as a failed OTP. */
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Restore a persisted session before the app decides which stack to show, so a
  // returning customer never flashes the sign-in screen.
  useEffect(() => {
    let active = true;
    hydrateSession()
      .then((restored) => {
        if (active) setSessionState(restored);
      })
      .finally(() => {
        if (active) setIsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Picks up out-of-band changes: a token rotated by the API refresh path, or a
  // forced sign-out when that refresh fails.
  useEffect(() => subscribe(() => setSessionState(getSession())), []);

  const signIn = useCallback((result: VerifyResult) => {
    setSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      bypassed: result.bypassed,
    });
  }, []);

  const signInAsGuest = useCallback(async () => {
    const result = await requestGuestSession();
    setSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      bypassed: result.bypassed,
    });
  }, []);

  // Ends the session on the server too (the access token is revoked and the refresh cookie
  // cleared) — best-effort and capped, so a dead connection never blocks signing out. Clearing
  // only the local copy left the token usable and the socket connected in the previous
  // customer's order rooms.
  const signOut = useCallback(async () => {
    const current = getSession();
    if (current?.accessToken && !current.bypassed) {
      await Promise.race([
        apiSend('POST', '/api/auth/logout').catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    }
    destroySocket();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: session != null,
      isGuest: session?.user.role === 'guest',
      isReady,
      signIn,
      signInAsGuest,
      signOut,
    }),
    [session, isReady, signIn, signInAsGuest, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
