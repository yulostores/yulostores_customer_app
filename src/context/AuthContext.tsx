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
import type { VerifyResult } from '../services/auth';
import { getSession, setSession, subscribe, type Session } from '../services/session';

interface AuthContextValue {
  session: Session | null;
  user: Session['user'] | null;
  isAuthenticated: boolean;
  /** In-memory store is ready synchronously; kept for a future async backend. */
  isReady: boolean;
  signIn: (result: VerifyResult) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<Session | null>(() => getSession());

  useEffect(() => subscribe(() => setSessionState(getSession())), []);

  const signIn = useCallback((result: VerifyResult) => {
    setSession({
      accessToken: result.accessToken,
      user: result.user,
      bypassed: result.bypassed,
    });
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: session != null,
      isReady: true,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
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
