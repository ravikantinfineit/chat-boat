import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { HoldsModule } from '../holds/holds.module';
import { TenantModule } from '../tenant/tenant.module';
import { OrganisationController } from './organisation.controller';
import { TenantController } from './tenant.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [TenantModule, ErpModule, HoldsModule],
  controllers: [OrganisationController, TenantController],
  providers: [UsageService],
})
export class AdminModule {}
