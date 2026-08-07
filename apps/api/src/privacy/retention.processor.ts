import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RetentionService } from './retention.service';

export const RETENTION_QUEUE = 'retention';

/** 03:15, when nobody is shopping for diamonds. */
const NIGHTLY = '15 3 * * *';

@Processor(RETENTION_QUEUE)
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(private readonly retention: RetentionService) {
    super();
  }

  async process(): Promise<void> {
    const { tenants, conversations } = await this.retention.sweep();
    this.logger.log(`Retention sweep: ${conversations} conversations deleted across ${tenants} showrooms`);
  }
}

/**
 * Registers the nightly sweep once, at boot.
 *
 * `upsertJobScheduler` is idempotent under a fixed id, so restarting the API —
 * or running several instances behind a load balancer — leaves exactly one
 * schedule rather than one per process.
 */
@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(@InjectQueue(RETENTION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler('nightly-retention', { pattern: NIGHTLY });
    } catch (error) {
      // Worth shouting about — silently missing means data outliving its window
      // — but not worth refusing to serve customers over.
      this.logger.error(`Could not schedule the retention sweep: ${(error as Error).message}`);
    }
  }
}
