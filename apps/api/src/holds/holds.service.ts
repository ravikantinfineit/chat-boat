import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import type { HoldDiamondRequest, HoldDiamondResponse } from '@diamond/shared';
import { isSellable } from '@diamond/shared';
import { Hold, Tenant } from '../database/entities';
import { ErpService } from '../erp/erp.service';

export const HOLDS_QUEUE = 'holds';

export interface HoldExpiryJob {
  holdId: string;
}

/** Raised when the stone moved between the customer seeing it and booking it. */
export class DiamondNoLongerAvailableError extends Error {
  constructor(
    readonly diamondId: string,
    readonly status: string,
  ) {
    super(`Diamond ${diamondId} is no longer available (status: ${status})`);
    this.name = 'DiamondNoLongerAvailableError';
  }
}

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    @InjectRepository(Hold) private readonly holds: Repository<Hold>,
    @InjectQueue(HOLDS_QUEUE) private readonly queue: Queue<HoldExpiryJob>,
    private readonly erp: ErpService,
  ) {}

  /**
   * Spec 3.6 plus the warning in spec 6: diamonds are one-of-a-kind, so we
   * re-verify availability against the ERP immediately before committing.
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
      throw new DiamondNoLongerAvailableError(diamondId, availability.stock_status);
    }

    const response = await this.erp.holdDiamond(tenant, diamondId, request);

    const record = await this.holds.save(
      this.holds.create({
        tenant_id: tenant.id,
        conversation_id: conversationId ?? null,
        erp_hold_id: response.hold_id,
        diamond_id: diamondId,
        customer_name: request.customer_name,
        customer_phone: request.customer_phone,
        customer_email: request.customer_email ?? null,
        status: 'held',
        expires_at: new Date(response.expires_at),
      }),
    );

    // Wake up exactly when the ERP's hold lapses so we can follow up.
    const delay = Math.max(0, record.expires_at.getTime() - Date.now());
    await this.queue.add(
      'hold-expiry',
      { holdId: record.id },
      { delay, jobId: `hold-expiry:${record.id}`, removeOnComplete: true },
    );

    return response;
  }

  async releaseHold(tenant: Tenant, diamondId: string, erpHoldId: string): Promise<void> {
    await this.erp.releaseHold(tenant, diamondId, erpHoldId);
    await this.holds.update(
      { tenant_id: tenant.id, erp_hold_id: erpHoldId },
      { status: 'released' },
    );
    await this.queue.remove(`hold-expiry:${erpHoldId}`).catch(() => undefined);
  }

  findById(holdId: string): Promise<Hold | null> {
    return this.holds.findOne({ where: { id: holdId } });
  }

  markExpired(holdId: string): Promise<unknown> {
    return this.holds.update({ id: holdId, status: 'held' }, { status: 'expired' });
  }

  activeHoldsFor(tenantId: string): Promise<Hold[]> {
    return this.holds.find({
      where: { tenant_id: tenantId, status: 'held' },
      order: { expires_at: 'ASC' },
    });
  }
}
