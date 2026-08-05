import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InventoryUpdateWebhookPayload } from '@diamond/shared';
import { TenantService } from '../tenant/tenant.service';
import { CatalogService } from './catalog.service';

/**
 * Spec 3.11 — the dealer's system POSTs here whenever a diamond's price or
 * stock status changes, so we never quote a stone that has just been sold.
 *
 * The URL shown in the admin panel is:
 *   {PUBLIC_BASE_URL}/webhooks/{tenantId}/inventory-update
 */
@Controller('webhooks/:tenantId')
export class InventoryWebhookController {
  constructor(
    private readonly tenants: TenantService,
    private readonly catalog: CatalogService,
  ) {}

  @Post('inventory-update')
  @HttpCode(202)
  async inventoryUpdate(
    @Param('tenantId') tenantId: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() payload: InventoryUpdateWebhookPayload,
  ): Promise<{ received: true }> {
    const tenant = await this.tenants.findById(tenantId);

    // Optional but recommended: HMAC-SHA256 of the raw body, hex encoded.
    if (signature) {
      const expected = createHmac('sha256', tenant.webhook_secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      const provided = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expected, 'utf8');
      if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    if (!payload?.diamond_id) {
      throw new BadRequestException('diamond_id is required');
    }

    await this.catalog.applyInventoryUpdate(tenant, payload);
    return { received: true };
  }
}
