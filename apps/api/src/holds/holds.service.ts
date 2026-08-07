import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { HoldDiamondRequest, HoldDiamondResponse } from '@diamond/shared';
import { isSellable } from '@diamond/shared';
import { DiamondUnavailableError } from '../common/errors';
import { ErpService } from '../erp/erp.service';
import { PiiService } from '../privacy/pii.service';
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
    private readonly pii: PiiService,
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
        // The ERP already has the readable copy and is the source of truth for
        // contacting the customer; this mirror only needs to know the hold
        // exists, so it keeps the details encrypted.
        ...this.pii.sealRequired({
          name: request.customer_name,
          phone: request.customer_phone,
          email: request.customer_email,
        }),
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

  /**
   * Wake up exactly when the ERP's hold lapses so we can follow up.
   *
   * Never allowed to fail the hold. By the time this runs the stone is already
   * reserved in the dealer's system and recorded here, so throwing would report
   * failure for something that actually succeeded — and the retry would then
   * find the stone "taken" by the customer's own hold. The ERP releases expired
   * holds on its own; this job only keeps our mirror honest.
   */
  private async scheduleExpiry(hold: Hold): Promise<void> {
    try {
      await this.queue.add(
        'hold-expiry',
        { holdId: hold.id },
        {
          delay: Math.max(0, hold.expiresAt.getTime() - Date.now()),
          jobId: expiryJobId(hold.id),
          removeOnComplete: true,
        },
      );
    } catch (error) {
      this.logger.error(
        `Hold ${hold.erpHoldId} succeeded but its expiry job could not be queued: ${
          (error as Error).message
        }`,
      );
    }
  }
}

/**
 * Derived from the local id so scheduling and removal always agree.
 *
 * No colons: BullMQ uses ':' as its Redis key separator and rejects custom job
 * ids containing one.
 */
function expiryJobId(holdId: string): string {
  return `hold-expiry-${holdId}`;
}
