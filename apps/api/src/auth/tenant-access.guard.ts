import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ResourceNotFoundError } from '../common/errors';
import { TenantService } from '../tenant/tenant.service';
import type { AuthContext } from './auth.decorators';
import type { Tenant } from '../prisma';

/**
 * Resolves `:tenantId` into an ownership-checked tenant on the request.
 *
 * Global, so any route with a `:tenantId` param is scoped automatically — a new
 * controller cannot forget it. Controllers then read `@CurrentTenant()` and
 * never see the raw id, which is what makes the previous IDOR unwritable rather
 * than merely fixed.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthContext; tenant?: Tenant }>();

    const raw = request.params?.tenantId;
    const tenantId = Array.isArray(raw) ? raw[0] : raw;
    if (!tenantId) return true; // route is not tenant-scoped

    const user = request.authUser;
    // Public tenant-scoped routes (the ERP webhook) authenticate by HMAC and
    // resolve the tenant themselves.
    if (!user) return true;

    request.tenant =
      user.platformRole === 'platform_admin'
        ? await this.tenants.findByIdUnscoped(tenantId)
        : await this.tenants.findForOrganisation(tenantId, requireOrganisation(user));

    return true;
  }
}

function requireOrganisation(user: AuthContext): string {
  // A user with no membership has no showrooms; 404 keeps the response identical
  // to asking for someone else's, so nothing is learned either way.
  if (!user.organisationId) throw new ResourceNotFoundError('Showroom');
  return user.organisationId;
}
