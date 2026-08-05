import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ErpService } from './erp.service';

@Module({
  imports: [TenantModule],
  providers: [ErpService],
  exports: [ErpService],
})
export class ErpModule {}
