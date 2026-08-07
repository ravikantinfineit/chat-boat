import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

/**
 * Gate for every signed-in route.
 *
 * Renders nothing while the session is being restored — without that, a
 * refresh flashes the login page for a moment before the user reappears.
 *
 * This is a convenience, not the security boundary: the API rejects
 * unauthenticated requests regardless of what the browser chooses to render.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <main className="layout"><p className="muted">Loading…</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
