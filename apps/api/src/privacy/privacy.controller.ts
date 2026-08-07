import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentTenant, CurrentUser, Roles, type AuthContext } from '../auth/auth.decorators';
import type { Tenant } from '../prisma';
import { AuditService } from './audit.service';
import { RetentionService } from './retention.service';

class CustomerLookupDto {
  @IsString() @MinLength(3) term: string;
  @IsIn(['phone', 'email']) kind: 'phone' | 'email';
}

/**
 * The operations a dealer must be able to perform when their customer asks
 * "what do you have on me?" or "delete it".
 *
 * Every one is audited, including the searches — an erasure tool that can also
 * be used to look people up needs a record of who looked.
 */
@Controller('admin/tenants/:tenantId/privacy')
export class PrivacyController {
  constructor(
    private readonly retention: RetentionService,
    private readonly audit: AuditService,
  ) {}

  @Post('customer-lookup')
  @Roles('owner', 'admin')
  async lookup(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Body() dto: CustomerLookupDto,
    @Req() request: Request,
  ) {
    const found = await this.retention.findCustomer(tenant, dto.term, dto.kind);
    await this.audit.record(
      {
        action: 'customer.search',
        tenantId: tenant.id,
        // The search term itself is never written to the audit row — that would
        // put the phone number back in the clear in the table meant to protect it.
        metadata: { kind: dto.kind, conversations: found.conversations.length },
      },
      user,
      request,
    );
    return found;
  }

  /** Owners only. This is irreversible and there is no undo. */
  @Post('erase-customer')
  @Roles('owner')
  async erase(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthContext,
    @Body() dto: CustomerLookupDto,
    @Req() request: Request,
  ) {
    const result = await this.retention.eraseCustomer(tenant, dto.term, dto.kind);
    await this.audit.record(
      { action: 'customer.erase', tenantId: tenant.id, metadata: { kind: dto.kind, ...result } },
      user,
      request,
    );
    return result;
  }
}

/** Organisation-wide, not per showroom — the trail spans every showroom you own. */
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('owner', 'admin')
  async list(@CurrentUser() user: AuthContext, @Query('limit') limit?: string) {
    if (!user.organisationId) return [];
    return this.audit.forOrganisation(user.organisationId, Math.min(Number(limit) || 100, 500));
  }
}
