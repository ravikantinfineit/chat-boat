import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'dc_session';

/**
 * httpOnly so an XSS in the admin SPA cannot read the session — the reason the
 * token is a cookie rather than something the app stores itself.
 *
 * sameSite 'lax' assumes the admin UI and the API share a registrable domain
 * (ports are ignored, so localhost:5173 → localhost:3000 is same-site). If they
 * are ever split across domains this must become 'none' + secure, and a CSRF
 * token is then required — the failure is silent otherwise: login appears to
 * succeed and every request after it is unauthenticated.
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}
