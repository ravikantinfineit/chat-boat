import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, Roles, type AuthContext } from '../auth/auth.decorators';
import { ResourceNotFoundError } from '../common/errors';
import { PrismaService } from '../prisma';
import { TenantService } from '../tenant/tenant.service';
import { CreateTenantDto } from './dto';
import { toTenantView } from './tenant.presenter';

/**
 * Routes that act on the caller's organisation as a whole.
 *
 * The organisation comes from the session, never from the request — there is no
 * parameter here a caller could tamper with.
 */
@Controller('admin')
export class OrganisationController {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get publicBaseUrl(): string {
    return this.config.getOrThrow<string>('publicBaseUrl');
  }

  /**
   * Headline numbers for the dashboard, scoped to the caller's organisation.
   *
   * Counted here rather than in the browser so the panel makes one request
   * instead of one per showroom, and so a client can never total up rows that
   * are not theirs.
   */
  @Get('overview')
  async overview(@CurrentUser() user: AuthContext) {
    const organisationId = requireOrganisation(user);
    const tenants = await this.tenants.findAllForOrganisation(organisationId);
    const tenantIds = tenants.map((tenant) => tenant.id);

    if (tenantIds.length === 0) {
      return { showrooms: 0, conversations: 0, messages: 0, activeHolds: 0, perShowroom: [] };
    }

    const [conversations, messages, activeHolds, byShowroom] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId: { in: tenantIds } } }),
      this.prisma.chatMessage.count({ where: { tenantId: { in: tenantIds } } }),
      this.prisma.hold.count({ where: { tenantId: { in: tenantIds }, status: 'held' } }),
      this.prisma.conversation.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds } },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map(byShowroom.map((row) => [row.tenantId, row._count._all]));

    return {
      showrooms: tenants.length,
      conversations,
      messages,
      activeHolds,
      perShowroom: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        erp_base_url: tenant.erpBaseUrl,
        conversations: counts.get(tenant.id) ?? 0,
      })),
    };
  }

  @Get('tenants')
  async list(@CurrentUser() user: AuthContext) {
    const tenants = await this.tenants.findAllForOrganisation(requireOrganisation(user));
    return tenants.map((tenant) => toTenantView(tenant, this.publicBaseUrl));
  }

  @Post('tenants')
  @Roles('owner', 'admin')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateTenantDto) {
    const tenant = await this.tenants.create({
      organisationId: requireOrganisation(user),
      name: dto.name,
      erpBaseUrl: dto.erp_base_url,
      erpApiKey: dto.erp_api_key,
      companyId: dto.company_id,
      erpRateLimitPerMinute: dto.erp_rate_limit_per_minute,
      defaultHoldHours: dto.default_hold_hours,
      brandInstructions: dto.brand_instructions,
    });
    return toTenantView(tenant, this.publicBaseUrl);
  }
}

/** Platform staff have no organisation of their own to create showrooms in. */
function requireOrganisation(user: AuthContext): string {
  if (!user.organisationId) throw new ResourceNotFoundError('Organisation');
  return user.organisationId;
}
