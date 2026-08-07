import type { CorsOptions, CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

/**
 * Two surfaces with opposite requirements, so the policy is chosen per request.
 *
 * The admin panel sends a session cookie, so it must be restricted to known
 * origins — reflecting arbitrary origins while allowing credentials would let
 * any website call /admin with the signed-in user's cookie.
 *
 * The widget is embedded on dealers' own sites and cannot have a fixed origin
 * list, but it authenticates with a header key and never sends a cookie — so
 * open origins are safe there precisely because credentials are refused.
 */
export function corsDelegate(adminOrigins: string[]): CorsOptionsDelegate<Request> {
  return (req, callback) => {
    const path = req.url ?? '';
    const isAdminSurface =
      path.startsWith('/admin') || path.startsWith('/auth') || path.startsWith('/platform');

    const options: CorsOptions = isAdminSurface
      ? {
          origin: adminOrigins,
          credentials: true,
          methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
        }
      : {
          origin: true,
          credentials: false,
          methods: ['POST', 'GET', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type',
            'X-Widget-Key',
            'X-Visitor-Id',
            'X-Webhook-Signature',
          ],
        };

    callback(null, options);
  };
}
