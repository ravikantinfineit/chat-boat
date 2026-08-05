import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hold } from '../database/entities';
import { ErpModule } from '../erp/erp.module';
import { HoldsProcessor } from './holds.processor';
import { HOLDS_QUEUE, HoldsService } from './holds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Hold]),
    BullModule.registerQueue({ name: HOLDS_QUEUE }),
    ErpModule,
  ],
  providers: [HoldsService, HoldsProcessor],
  exports: [HoldsService],
})
export class HoldsModule {}
