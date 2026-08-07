import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PiiService } from './pii.service';
import { AuditController, PrivacyController } from './privacy.controller';
import { RETENTION_QUEUE, RetentionProcessor, RetentionScheduler } from './retention.processor';
import { RetentionService } from './retention.service';

/**
 * Global because encryption and audit are cross-cutting: chat, holds and admin
 * all write customer details, and a module that has to remember to import this
 * is a module that can forget to.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: RETENTION_QUEUE })],
  controllers: [PrivacyController, AuditController],
  providers: [PiiService, AuditService, RetentionService, RetentionProcessor, RetentionScheduler],
  exports: [PiiService, AuditService, RetentionService],
})
export class PrivacyModule {}
