import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HOLDS_QUEUE, HoldExpiryJob, HoldsService } from './holds.service';

/**
 * Fires when a hold reaches its expiry.
 *
 * The ERP auto-releases on its side (spec 3.6), so this job's job is to keep
 * our mirror honest and give the dealer a hook for follow-up — a "your stone is
 * about to be released" WhatsApp nudge is the obvious next step here.
 */
@Processor(HOLDS_QUEUE)
export class HoldsProcessor extends WorkerHost {
  private readonly logger = new Logger(HoldsProcessor.name);

  constructor(private readonly holds: HoldsService) {
    super();
  }

  async process(job: Job<HoldExpiryJob>): Promise<void> {
    const hold = await this.holds.findById(job.data.holdId);
    if (!hold) return;
    if (hold.status !== 'held') return; // already released or converted to an order

    await this.holds.markExpired(hold.id);
    this.logger.log(
      `Hold ${hold.erp_hold_id} on ${hold.diamond_id} expired for ${hold.customer_name}`,
    );

    // Follow-up hook: notify the customer / alert the sales team here.
  }
}
