import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpService } from '../erp/erp.service';
import { HoldsService } from '../holds/holds.service';
import { PrismaService } from '../prisma';
import { TenantService, type CreateTenantInput, type UpdateTenantInput } from '../tenant/tenant.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { toTenantView } from './tenant.presenter';

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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get publicBaseUrl(): string {
    return this.config.getOrThrow<string>('publicBaseUrl');
  }

  @Get('tenants')
  async list() {
    const tenants = await this.tenants.findAll();
    return tenants.map((t) => toTenantView(t, this.publicBaseUrl));
  }

  @Get('tenants/:id')
  async get(@Param('id') id: string) {
    return toTenantView(await this.tenants.findById(id), this.publicBaseUrl);
  }

  @Post('tenants')
  async create(@Body() dto: CreateTenantDto) {
    const tenant = await this.tenants.create(toCreateInput(dto));
    return toTenantView(tenant, this.publicBaseUrl);
  }

  @Patch('tenants/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenants.update(id, toUpdateInput(dto));
    return toTenantView(tenant, this.publicBaseUrl);
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
      return { ok: true, total_results: result.total_results, sample: result.results[0] ?? null };
    } catch (error) {
      // Reported as data, not an HTTP error — a failed probe is a valid answer.
      return { ok: false, error: (error as Error).message };
    }
  }

  @Get('tenants/:id/conversations')
  async conversationsFor(@Param('id') id: string) {
    return this.prisma.conversation.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
  }

  @Get('tenants/:id/holds')
  holdsFor(@Param('id') id: string) {
    return this.holds.activeHoldsFor(id);
  }
}

function toCreateInput(dto: CreateTenantDto): CreateTenantInput {
  return {
    name: dto.name,
    erpBaseUrl: dto.erp_base_url,
    erpApiKey: dto.erp_api_key,
    companyId: dto.company_id,
    erpRateLimitPerMinute: dto.erp_rate_limit_per_minute,
    defaultHoldHours: dto.default_hold_hours,
    brandInstructions: dto.brand_instructions,
  };
}

function toUpdateInput(dto: UpdateTenantDto): UpdateTenantInput {
  return {
    name: dto.name,
    erpBaseUrl: dto.erp_base_url,
    erpApiKey: dto.erp_api_key,
    companyId: dto.company_id,
    erpRateLimitPerMinute: dto.erp_rate_limit_per_minute,
    defaultHoldHours: dto.default_hold_hours,
    brandInstructions: dto.brand_instructions,
  };
}
