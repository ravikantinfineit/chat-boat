import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../database/entities';
import { ErpModule } from '../erp/erp.module';
import { HoldsModule } from '../holds/holds.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation]), TenantModule, ErpModule, HoldsModule],
  controllers: [AdminController],
})
export class AdminModule {}
