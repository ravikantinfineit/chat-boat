import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma';
import {
  IS_PUBLIC,
  REQUIRED_ROLES,
  REQUIRES_PLATFORM_ADMIN,
  type AuthContext,
} from './auth.decorators';
import { SessionService } from './session.service';
import { SESSION_COOKIE } from './cookie';

/**
 * Registered as a global APP_GUARD, so a newly added controller is protected
 * without anyone remembering to decorate it. Fails closed by construction:
 * access requires an explicit @Public().
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { authUser?: AuthContext }>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('Not signed in');

    const userId = await this.sessions.resolve(token);
    if (!userId) throw new UnauthorizedException('Session expired');

    // Loaded per request rather than stored in the session, so a role change or
    // a deactivated account takes effect on the very next call.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { organisation: true }, take: 1 } },
    });
    if (!user || !user.active) throw new UnauthorizedException('Account is not active');

    const membership = user.memberships[0];
    if (membership && !membership.organisation.active) {
      throw new ForbiddenException('Organisation is suspended');
    }

    request.authUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      organisationId: membership?.organisationId ?? null,
      organisationName: membership?.organisation.name ?? null,
      role: membership?.role ?? null,
    };

    this.assertAuthorised(context, request.authUser);
    return true;
  }

  private assertAuthorised(context: ExecutionContext, user: AuthContext): void {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(REQUIRES_PLATFORM_ADMIN, targets)) {
      if (user.platformRole !== 'platform_admin') {
        throw new ForbiddenException('Platform access required');
      }
      return; // platform staff are not org-scoped
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, targets);
    if (required?.length && !(user.role && required.includes(user.role))) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}

/** Minimal cookie reader — avoids a dependency for one header. */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
