import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CurrentTenant, CurrentUser, Roles, type AuthContext } from '../auth/auth.decorators';
import { ErpService } from '../erp/erp.service';
import { ResourceNotFoundError } from '../common/errors';
import { HoldsService } from '../holds/holds.service';
import { AuditService } from '../privacy/audit.service';
import { PiiService } from '../privacy/pii.service';
import { PrismaService, type Tenant } from '../prisma';
import { TenantService } from '../tenant/tenant.service';
import { UpdateAgentRulesDto, UpdatePrivacyDto, UpdateTenantDto } from './dto';
import { toAgentRulesView, toPrivacyView, toTenantCredentialsView, toTenantView } from './tenant.presenter';
import { UsageService } from './usage.service';

/**
 * Everything scoped to one showroom.
 *
 * The tenant id is never read from the request here. TenantAccessGuard resolves
 * `:tenantId`, proves it belongs to the caller's organisation, and hands over
 * the row, which methods take as `@CurrentTenant()` — so the id a caller
 * supplied is never what these methods query on. That is what makes the previous
 * cross-tenant read impossible to write here, rather than merely absent.
 *
 * One route does read a param, `:conversationId`, and it is scoped by the
 * verified tenant in the same query — asking for another showroom's conversation
 * finds nothing.
 */
@Controller('admin/tenants/:tenantId')
export class TenantController {
  constructor(
    private readonly tenants: TenantService,
    private readonly erp: ErpService,
    private readonly holds: HoldsService,
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly audit: AuditService,
    private readonly pii: PiiService,
    private readonly config: ConfigService,
  ) {}

  private get publicBaseUrl(): string {
    return this.config.getOrThrow<string>('publicBaseUrl');
  }

  @Get()
  get(@CurrentTenant() tenant: Tenant) {
    return toTenantView(tenant, this.publicBaseUrl);
  }

  @Patch()
  @Roles('owner', 'admin')
  async update(@CurrentTenant() tenant: Tenant, @Body() dto: UpdateTenantDto) {
    const updated = await this.tenants.update(tenant.id, {
      name: dto.name,
      erpBaseUrl: dto.erp_base_url,
      erpApiKey: dto.erp_api_key,
      companyId: dto.company_id,
      erpRateLimitPerMinute: dto.erp_rate_limit_per_minute,
      defaultHoldHours: dto.default_hold_hours,
      brandInstructions: dto.brand_instructions,
    });
    return toTenantView(updated, this.publicBaseUrl);
  }

  /**
   * The webhook secret is not in the list payload — it is fetched deliberately,
   * by a privileged role, so it is not scattered through every page load.
   */
  @Get('credentials')
  @Roles('owner', 'admin')
  async credentials(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Req() request: Request,
  ) {
    await this.audit.record(
      { action: 'credentials.reveal', tenantId: tenant.id, target: 'webhook_secret' },
      user,
      request,
    );
    return toTenantCredentialsView(tenant, this.publicBaseUrl);
  }

  // --- agent rules ----------------------------------------------------------

  @Get('agent-rules')
  agentRules(@CurrentTenant() tenant: Tenant) {
    return toAgentRulesView(tenant);
  }

  @Patch('agent-rules')
  @Roles('owner', 'admin')
  async updateAgentRules(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdateAgentRulesDto,
    @Req() request: Request,
  ) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        agentPersona: dto.agent_persona,
        agentTone: dto.agent_tone,
        guardrails: dto.guardrails,
        escalationRules: dto.escalation_rules,
        escalationContact: dto.escalation_contact,
        allowHolds: dto.allow_holds,
        allowQuotes: dto.allow_quotes,
        allowOrders: dto.allow_orders,
        maxHoldHours: dto.max_hold_hours,
      },
    });

    // Turning ordering on is the change most worth being able to point at later.
    await this.audit.record(
      {
        action: 'agent-rules.update',
        tenantId: tenant.id,
        metadata: {
          allowHolds: updated.allowHolds,
          allowQuotes: updated.allowQuotes,
          allowOrders: updated.allowOrders,
        },
      },
      user,
      request,
    );
    return toAgentRulesView(updated);
  }

  // --- privacy and cost ceilings --------------------------------------------

  @Get('privacy')
  @Roles('owner', 'admin')
  privacy(@CurrentTenant() tenant: Tenant) {
    return toPrivacyView(tenant);
  }

  @Patch('privacy')
  @Roles('owner')
  async updatePrivacy(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdatePrivacyDto,
    @Req() request: Request,
  ) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        retentionDays: dto.retention_days,
        allowedOrigins: dto.allowed_origins,
        dailyMessageCap: dto.daily_message_cap,
        monthlyTokenBudget: dto.monthly_token_budget,
      },
    });

    await this.audit.record(
      {
        action: 'retention.update',
        tenantId: tenant.id,
        metadata: { retentionDays: updated.retentionDays },
      },
      user,
      request,
    );
    return toPrivacyView(updated);
  }

  /** Days is capped: the raw-SQL day buckets are cheap, but not unbounded. */
  @Get('usage')
  usage(@CurrentTenant() tenant: Tenant, @Query('days') days?: string) {
    return this.usageService.summarise(tenant.id, Math.min(Math.max(Number(days) || 30, 1), 365));
  }

  @Post('test-connection')
  async testConnection(@CurrentTenant() tenant: Tenant) {
    try {
      const result = await this.erp.searchDiamonds(tenant, { limit: 1 });
      return { ok: true, total_results: result.total_results, sample: result.results[0] ?? null };
    } catch (error) {
      // Reported as data, not an HTTP error — a failed probe is a valid answer.
      return { ok: false, error: (error as Error).message };
    }
  }

  @Get('conversations')
  async conversations(@CurrentTenant() tenant: Tenant) {
    const rows = await this.prisma.conversation.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });

    // Decrypted for display only. The blind-index columns never leave the server.
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      createdAt: row.createdAt,
      customerName: this.pii.open(row.customerName),
      _count: row._count,
    }));
  }

  /**
   * The full transcript.
   *
   * Staff can read everything a customer typed — that was a deliberate product
   * decision, and the audit row is what makes it defensible. Written before the
   * transcript is returned, so a read is never served without a record of it.
   */
  @Get('conversations/:conversationId')
  async transcript(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: tenant.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new ResourceNotFoundError('Conversation', conversationId);

    await this.audit.record(
      { action: 'transcript.view', tenantId: tenant.id, target: conversation.id },
      user,
      request,
    );

    return {
      id: conversation.id,
      channel: conversation.channel,
      createdAt: conversation.createdAt,
      customerName: this.pii.open(conversation.customerName),
      customerPhone: this.pii.open(conversation.customerPhone),
      customerEmail: this.pii.open(conversation.customerEmail),
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    };
  }

  @Get('holds')
  async activeHolds(@CurrentTenant() tenant: Tenant) {
    const holds = await this.holds.activeHoldsFor(tenant.id);
    return holds.map((hold) => ({
      ...hold,
      customerName: this.pii.open(hold.customerName),
      customerPhone: this.pii.open(hold.customerPhone),
      customerEmail: this.pii.open(hold.customerEmail),
      customerPhoneIndex: undefined,
      customerEmailIndex: undefined,
    }));
  }
}
