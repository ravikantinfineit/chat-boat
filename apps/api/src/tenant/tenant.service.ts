import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResourceNotFoundError } from '../common/errors';
import { PrismaService, type Tenant } from '../prisma';
import { decryptSecret, encryptSecret, generateKey } from './secret.util';

export interface TenantCredentials {
  baseUrl: string;
  apiKey: string;
  companyId: string | null;
  rateLimitPerMinute: number;
}

export interface CreateTenantInput {
  /** Which organisation owns the showroom. Never taken from the request body. */
  organisationId: string;
  name: string;
  erpBaseUrl: string;
  erpApiKey: string;
  companyId?: string | null;
  erpRateLimitPerMinute?: number;
  defaultHoldHours?: number;
  brandInstructions?: string | null;
}

/** Same fields, all optional; omitting erpApiKey keeps the stored one. */
export type UpdateTenantInput = Partial<CreateTenantInput>;

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get appSecret(): string {
    return this.config.getOrThrow<string>('appSecret');
  }

  create(input: CreateTenantInput): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        organisationId: input.organisationId,
        name: input.name,
        widgetKey: generateKey('wk'),
        webhookSecret: generateKey('whsec'),
        erpBaseUrl: normaliseBaseUrl(input.erpBaseUrl),
        erpApiKeyEncrypted: encryptSecret(input.erpApiKey, this.appSecret),
        companyId: input.companyId ?? null,
        erpRateLimitPerMinute: input.erpRateLimitPerMinute ?? 60,
        defaultHoldHours: input.defaultHoldHours ?? 24,
        brandInstructions: input.brandInstructions ?? null,
      },
    });
  }

  async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    await this.findByIdUnscoped(id); // 404 rather than Prisma's P2025;
    // ownership was already established by TenantAccessGuard before this runs.

    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: input.name,
        erpBaseUrl: input.erpBaseUrl ? normaliseBaseUrl(input.erpBaseUrl) : undefined,
        // Blank means "keep the current key" — never overwrite with empty.
        erpApiKeyEncrypted: input.erpApiKey
          ? encryptSecret(input.erpApiKey, this.appSecret)
          : undefined,
        companyId: input.companyId,
        erpRateLimitPerMinute: input.erpRateLimitPerMinute,
        defaultHoldHours: input.defaultHoldHours,
        brandInstructions: input.brandInstructions,
      },
    });
  }

  findAllForOrganisation(organisationId: string): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Ownership-checked lookup.
   *
   * Reports "not found" rather than "forbidden" for another organisation's
   * showroom — a 403 would confirm the id exists, which is an enumeration
   * oracle.
   */
  async findForOrganisation(id: string, organisationId: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, organisationId } });
    if (!tenant) throw new ResourceNotFoundError('Showroom', id);
    return tenant;
  }

  /**
   * NO ownership check — the caller must have established authority some other
   * way. Only two callers are legitimate: the HMAC-authenticated inventory
   * webhook, and TenantAccessGuard when acting for platform staff.
   *
   * Named to make an accidental call obvious in review.
   */
  async findByIdUnscoped(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new ResourceNotFoundError('Showroom', id);
    return tenant;
  }

  /** Resolves the tenant behind a widget embed key. */
  async findByWidgetKey(widgetKey: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findFirst({ where: { widgetKey, active: true } });
    if (!tenant) throw new ResourceNotFoundError('Widget key');
    return tenant;
  }

  /** Decrypts the ERP key. Call only when about to make an ERP request. */
  credentialsFor(tenant: Tenant): TenantCredentials {
    return {
      baseUrl: tenant.erpBaseUrl,
      apiKey: decryptSecret(tenant.erpApiKeyEncrypted, this.appSecret),
      companyId: tenant.companyId,
      rateLimitPerMinute: tenant.erpRateLimitPerMinute,
    };
  }
}

/** Trailing slashes would double up when endpoint paths are appended. */
function normaliseBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
