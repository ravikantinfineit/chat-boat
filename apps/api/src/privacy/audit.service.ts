import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, PrismaService } from '../prisma';

/**
 * Whoever performed the action. Narrower than AuthContext on purpose — an
 * AuthContext satisfies it structurally, and the nightly sweep, which has no
 * signed-in user, can supply a null actor without a cast.
 */
export interface AuditActor {
  userId: string | null;
  email: string;
  organisationId?: string | null;
}

/** The actions worth a permanent record. Union rather than string so a typo is a compile error. */
export type AuditAction =
  | 'credentials.reveal'
  | 'tenant.update'
  | 'tenant.create'
  | 'agent-rules.update'
  | 'transcript.view'
  | 'customer.search'
  | 'customer.erase'
  | 'retention.update'
  | 'retention.sweep';

export interface AuditEntry {
  action: AuditAction;
  organisationId?: string | null;
  tenantId?: string | null;
  target?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an action, and never fails the action it records.
   *
   * A write that throws here would turn "we could not log your credential
   * reveal" into "your credential reveal failed", which teaches staff to retry
   * privileged operations. The audit gap is logged loudly instead.
   */
  async record(entry: AuditEntry, actor: AuditActor, request?: Request): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          organisationId: entry.organisationId ?? actor.organisationId ?? null,
          tenantId: entry.tenantId ?? null,
          actorUserId: actor.userId,
          actorEmail: actor.email,
          target: entry.target ?? null,
          ip: request?.ip ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `AUDIT GAP: ${entry.action} by ${actor.email} was not recorded: ${(error as Error).message}`,
      );
    }
  }

  /** System actions with no signed-in actor — the nightly retention sweep. */
  async recordSystem(entry: AuditEntry): Promise<void> {
    await this.record(entry, { userId: null, email: 'system' });
  }

  forOrganisation(organisationId: string, limit = 200) {
    return this.prisma.auditLog.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
