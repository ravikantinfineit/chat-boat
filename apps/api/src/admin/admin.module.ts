import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { HoldsModule } from '../holds/holds.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TenantModule, ErpModule, HoldsModule],
  controllers: [AdminController],
})
export class AdminModule {}
