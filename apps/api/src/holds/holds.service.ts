import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { HoldDiamondRequest, HoldDiamondResponse } from '@diamond/shared';
import { isSellable } from '@diamond/shared';
import { DiamondUnavailableError } from '../common/errors';
import { ErpService } from '../erp/erp.service';
import { HoldStatus, PrismaService, type Hold, type Tenant } from '../prisma';

export const HOLDS_QUEUE = 'holds';

export interface HoldExpiryJob {
  holdId: string;
}

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly erp: ErpService,
    @InjectQueue(HOLDS_QUEUE) private readonly queue: Queue<HoldExpiryJob>,
  ) {}

  /**
   * Spec 3.6, plus the warning in spec 6: diamonds are one-of-a-kind, so
   * availability is re-verified against the ERP immediately before committing.
   * Without this, two customers can be shown the same "available" stone.
   */
  async createHold(
    tenant: Tenant,
    diamondId: string,
    request: HoldDiamondRequest,
    conversationId?: string,
  ): Promise<HoldDiamondResponse> {
    const availability = await this.erp.checkAvailability(tenant, diamondId);
    if (!isSellable(availability.stock_status)) {
      throw new DiamondUnavailableError(diamondId, availability.stock_status);
    }

    const response = await this.erp.holdDiamond(tenant, diamondId, request);

    const hold = await this.prisma.hold.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversationId ?? null,
        erpHoldId: response.hold_id,
        diamondId,
        customerName: request.customer_name,
        customerPhone: request.customer_phone,
        customerEmail: request.customer_email ?? null,
        status: HoldStatus.held,
        expiresAt: new Date(response.expires_at),
      },
    });

    await this.scheduleExpiry(hold);
    return response;
  }

  async releaseHold(tenant: Tenant, diamondId: string, erpHoldId: string): Promise<void> {
    await this.erp.releaseHold(tenant, diamondId, erpHoldId);

    const hold = await this.prisma.hold.update({
      where: { tenantId_erpHoldId: { tenantId: tenant.id, erpHoldId } },
      data: { status: HoldStatus.released },
    });

    await this.queue.remove(expiryJobId(hold.id)).catch(() => undefined);
  }

  findById(holdId: string): Promise<Hold | null> {
    return this.prisma.hold.findUnique({ where: { id: holdId } });
  }

  /** Only flips holds still marked held, so a released one is never revived. */
  async markExpired(holdId: string): Promise<void> {
    await this.prisma.hold.updateMany({
      where: { id: holdId, status: HoldStatus.held },
      data: { status: HoldStatus.expired },
    });
  }

  activeHoldsFor(tenantId: string): Promise<Hold[]> {
    return this.prisma.hold.findMany({
      where: { tenantId, status: HoldStatus.held },
      orderBy: { expiresAt: 'asc' },
    });
  }

  /** Wake up exactly when the ERP's hold lapses so we can follow up. */
  private async scheduleExpiry(hold: Hold): Promise<void> {
    await this.queue.add(
      'hold-expiry',
      { holdId: hold.id },
      {
        delay: Math.max(0, hold.expiresAt.getTime() - Date.now()),
        jobId: expiryJobId(hold.id),
        removeOnComplete: true,
      },
    );
  }
}

/** Derived from the local id so scheduling and removal always agree. */
function expiryJobId(holdId: string): string {
  return `hold-expiry:${holdId}`;
}
