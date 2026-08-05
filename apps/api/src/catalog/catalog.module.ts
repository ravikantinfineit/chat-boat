import { Global, Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { TenantModule } from '../tenant/tenant.module';
import { CatalogService } from './catalog.service';
import { redisProvider, REDIS_CLIENT } from './redis.provider';
import { InventoryWebhookController } from './webhook.controller';

@Global()
@Module({
  imports: [ErpModule, TenantModule],
  controllers: [InventoryWebhookController],
  providers: [redisProvider, CatalogService],
  exports: [CatalogService, REDIS_CLIENT],
})
export class CatalogModule {}
