import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, UnauthenticatedError, type AuthUser } from './api';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the signed-in user for the app.
 *
 * The session itself is an httpOnly cookie the browser sends automatically, so
 * nothing is persisted here — on load we simply ask the server who we are.
 * That is deliberate: a token in localStorage would be readable by any script
 * that got injected into this page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((error: unknown) => {
        // Not being signed in is the normal first-visit case, not a failure.
        if (!(error instanceof UnauthenticatedError)) console.error(error);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    setUser(await api.me());
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
