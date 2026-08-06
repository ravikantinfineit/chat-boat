import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { HoldsProcessor } from './holds.processor';
import { HOLDS_QUEUE, HoldsService } from './holds.service';

@Module({
  imports: [BullModule.registerQueue({ name: HOLDS_QUEUE }), ErpModule],
  providers: [HoldsService, HoldsProcessor],
  exports: [HoldsService],
})
export class HoldsModule {}
