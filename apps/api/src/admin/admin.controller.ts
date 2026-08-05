import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { Conversation, Tenant } from '../database/entities';
import { ErpService } from '../erp/erp.service';
import { HoldsService } from '../holds/holds.service';
import { TenantService } from '../tenant/tenant.service';

class CreateTenantDto {
  @IsString() name: string;
  @IsString() erp_base_url: string;
  @IsString() erp_api_key: string;
  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) erp_rate_limit_per_minute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) default_hold_hours?: number;
  @IsOptional() @IsString() brand_instructions?: string;
}

class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() erp_base_url?: string;
  @IsOptional() @IsString() erp_api_key?: string;
  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) erp_rate_limit_per_minute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) default_hold_hours?: number;
  @IsOptional() @IsString() brand_instructions?: string;
}

/**
 * Backs the admin panel. The ERP API key is write-only here: it goes in through
 * these endpoints and is never returned.
 *
 * NOTE: add authentication before this is reachable from anywhere but localhost.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly tenants: TenantService,
    private readonly erp: ErpService,
    private readonly holds: HoldsService,
    private readonly config: ConfigService,
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
  ) {}

  @Get('tenants')
  async list() {
    const tenants = await this.tenants.findAll();
    return tenants.map((t) => this.present(t));
  }

  @Get('tenants/:id')
  async get(@Param('id') id: string) {
    return this.present(await this.tenants.findById(id));
  }

  @Post('tenants')
  async create(@Body() dto: CreateTenantDto) {
    return this.present(await this.tenants.create(dto));
  }

  @Patch('tenants/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.present(await this.tenants.update(id, dto));
  }

  /**
   * "Test connection" in the admin panel: runs one real search against the
   * dealer's ERP so a bad URL, key or company id surfaces during setup rather
   * than in front of a customer.
   */
  @Post('tenants/:id/test-connection')
  async testConnection(@Param('id') id: string) {
    const tenant = await this.tenants.findById(id);
    try {
      const result = await this.erp.searchDiamonds(tenant, { limit: 1 });
      return {
        ok: true,
        total_results: result.total_results,
        sample: result.results[0] ?? null,
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  @Get('tenants/:id/conversations')
  async conversationsFor(@Param('id') id: string) {
    return this.conversations.find({
      where: { tenant_id: id },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  @Get('tenants/:id/holds')
  async holdsFor(@Param('id') id: string) {
    return this.holds.activeHoldsFor(id);
  }

  /** Never exposes erp_api_key_encrypted. */
  private present(tenant: Tenant) {
    const baseUrl = this.config.getOrThrow<string>('publicBaseUrl');
    return {
      id: tenant.id,
      name: tenant.name,
      erp_base_url: tenant.erp_base_url,
      company_id: tenant.company_id,
      erp_rate_limit_per_minute: tenant.erp_rate_limit_per_minute,
      default_hold_hours: tenant.default_hold_hours,
      brand_instructions: tenant.brand_instructions,
      active: tenant.active,
      widget_key: tenant.widget_key,
      /** Hand these two to the dealer's developer for spec 3.11. */
      webhook_url: `${baseUrl}/webhooks/${tenant.id}/inventory-update`,
      webhook_secret: tenant.webhook_secret,
      created_at: tenant.created_at,
    };
  }
}
