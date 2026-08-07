import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Tenant } from '../prisma';
import type { OrgRole, PlatformRole } from '../generated/prisma/enums';

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRED_ROLES = 'auth:roles';
export const REQUIRES_PLATFORM_ADMIN = 'auth:platformAdmin';

/**
 * Opts a route out of authentication.
 *
 * The guard is global so everything is protected by default — this is the
 * complete list of things that legitimately are not:
 *   - POST /chat/message              the public widget (authenticates by widget key)
 *   - POST /webhooks/:tenantId/...    the dealer's ERP (authenticates by HMAC)
 *   - POST /auth/login                obviously
 * Adding to this list is a security decision, not a convenience.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to certain organisation roles. */
export const Roles = (...roles: OrgRole[]) => SetMetadata(REQUIRED_ROLES, roles);

/** Restricts a route to platform staff. Applied at class level on /platform/*. */
export const PlatformAdmin = () => SetMetadata(REQUIRES_PLATFORM_ADMIN, true);

/** The signed-in user, their membership and organisation. */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  platformRole: PlatformRole | null;
  organisationId: string | null;
  organisationName: string | null;
  role: OrgRole | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => ctx.switchToHttp().getRequest().authUser,
);

/**
 * The tenant named by the route's `:tenantId`, already ownership-checked by
 * TenantAccessGuard. Controllers use this instead of reading the param, so the
 * unverified id is never in scope.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant => ctx.switchToHttp().getRequest().tenant,
);
