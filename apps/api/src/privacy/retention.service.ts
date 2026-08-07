import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Tenant } from '../prisma';
import { AuditService } from './audit.service';
import { PiiService } from './pii.service';

export interface ErasureResult {
  conversations: number;
  messages: number;
  holds: number;
}

/**
 * Deleting customer data — on a schedule, and on request.
 *
 * Both matter for the same reason: encryption protects data from a stolen dump,
 * but the only defence against holding a customer's phone number for a decade
 * is not holding it.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Deletes conversations past each showroom's retention window.
   *
   * Per tenant rather than one global cutoff, because the window is the client's
   * to choose. Messages and tool-call events go with the conversation via
   * cascade; holds are deliberately not touched — an active hold is a live
   * commitment to a customer, and the ERP is still holding the stone.
   */
  async sweep(): Promise<{ tenants: number; conversations: number }> {
    const tenants = await this.prisma.tenant.findMany({
      // organisationId comes along so the audit row lands in the client's own
      // activity log. Without it the entry is written with a null organisation
      // and the org-scoped query never returns it — the dealer would have no
      // evidence that automatic deletion ran, which is the whole reassurance.
      select: { id: true, name: true, retentionDays: true, organisationId: true },
    });

    let conversations = 0;
    for (const tenant of tenants) {
      const cutoff = new Date(Date.now() - tenant.retentionDays * 24 * 60 * 60 * 1000);
      const { count } = await this.prisma.conversation.deleteMany({
        where: { tenantId: tenant.id, createdAt: { lt: cutoff } },
      });

      if (count > 0) {
        conversations += count;
        this.logger.log(
          `Retention: deleted ${count} conversations older than ${tenant.retentionDays} days from ${tenant.name}`,
        );
        await this.audit.recordSystem({
          action: 'retention.sweep',
          tenantId: tenant.id,
          organisationId: tenant.organisationId,
          metadata: { deleted: count, retentionDays: tenant.retentionDays },
        });
      }
    }

    return { tenants: tenants.length, conversations };
  }

  /**
   * Finds everything held about one customer, by phone or email.
   *
   * Matches on the blind index, so the search term itself is never compared
   * against anything readable — and a caller who does not already know the phone
   * number cannot go fishing.
   */
  async findCustomer(tenant: Tenant, term: string, kind: 'phone' | 'email') {
    const fingerprint = this.pii.fingerprint(term, kind);
    const where =
      kind === 'phone'
        ? { tenantId: tenant.id, customerPhoneIndex: fingerprint }
        : { tenantId: tenant.id, customerEmailIndex: fingerprint };

    const [conversations, holds] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.hold.findMany({ where, orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        createdAt: conversation.createdAt,
        messages: conversation._count.messages,
        customerName: this.pii.open(conversation.customerName),
      })),
      holds: holds.map((hold) => ({
        id: hold.id,
        erpHoldId: hold.erpHoldId,
        diamondId: hold.diamondId,
        status: hold.status,
        createdAt: hold.createdAt,
      })),
    };
  }

  /**
   * Erases everything about one customer within one showroom.
   *
   * Conversations are deleted outright rather than redacted: the transcript is
   * the richest record of them, since anything they typed mid-chat lives in it
   * and no column-level scrub would reach that.
   *
   * Holds are anonymised rather than deleted — the dealer still needs to know a
   * stone was reserved and released. What is removed is who reserved it.
   */
  async eraseCustomer(
    tenant: Tenant,
    term: string,
    kind: 'phone' | 'email',
  ): Promise<ErasureResult> {
    const fingerprint = this.pii.fingerprint(term, kind);
    const where =
      kind === 'phone'
        ? { tenantId: tenant.id, customerPhoneIndex: fingerprint }
        : { tenantId: tenant.id, customerEmailIndex: fingerprint };

    return this.prisma.$transaction(async (tx) => {
      const conversationIds = (
        await tx.conversation.findMany({ where, select: { id: true } })
      ).map((row) => row.id);

      const messages = await tx.chatMessage.count({
        where: { conversationId: { in: conversationIds } },
      });

      // Detach holds first: the conversation FK is SetNull, but the hold's own
      // contact columns would survive the conversation being deleted.
      const holds = await tx.hold.updateMany({
        where: {
          OR: [where, { tenantId: tenant.id, conversationId: { in: conversationIds } }],
        },
        data: {
          customerName: '(erased)',
          customerPhone: '(erased)',
          customerEmail: null,
          customerPhoneIndex: null,
          customerEmailIndex: null,
        },
      });

      const conversations = await tx.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      });

      return {
        conversations: conversations.count,
        messages,
        holds: holds.count,
      };
    });
  }
}
