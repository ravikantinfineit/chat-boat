import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../database/entities';
import { decryptSecret, encryptSecret, generateKey } from './secret.util';

export interface TenantCredentials {
  baseUrl: string;
  apiKey: string;
  companyId: string | null;
  rateLimitPerMinute: number;
}

export interface UpsertTenantInput {
  name: string;
  erp_base_url: string;
  /** Omit on update to keep the existing key. */
  erp_api_key?: string;
  company_id?: string | null;
  erp_rate_limit_per_minute?: number;
  default_hold_hours?: number;
  brand_instructions?: string | null;
}

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly config: ConfigService,
  ) {}

  private get appSecret(): string {
    return this.config.getOrThrow<string>('appSecret');
  }

  async create(input: UpsertTenantInput): Promise<Tenant> {
    if (!input.erp_api_key) {
      throw new Error('erp_api_key is required when creating a tenant');
    }
    const tenant = this.tenants.create({
      name: input.name,
      widget_key: generateKey('wk'),
      webhook_secret: generateKey('whsec'),
      erp_base_url: input.erp_base_url.replace(/\/+$/, ''),
      erp_api_key_encrypted: encryptSecret(input.erp_api_key, this.appSecret),
      company_id: input.company_id ?? null,
      erp_rate_limit_per_minute: input.erp_rate_limit_per_minute ?? 60,
      default_hold_hours: input.default_hold_hours ?? 24,
      brand_instructions: input.brand_instructions ?? null,
    });
    return this.tenants.save(tenant);
  }

  async update(id: string, input: Partial<UpsertTenantInput>): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (input.name !== undefined) tenant.name = input.name;
    if (input.erp_base_url !== undefined) tenant.erp_base_url = input.erp_base_url.replace(/\/+$/, '');
    if (input.erp_api_key) {
      tenant.erp_api_key_encrypted = encryptSecret(input.erp_api_key, this.appSecret);
    }
    if (input.company_id !== undefined) tenant.company_id = input.company_id;
    if (input.erp_rate_limit_per_minute !== undefined) {
      tenant.erp_rate_limit_per_minute = input.erp_rate_limit_per_minute;
    }
    if (input.default_hold_hours !== undefined) tenant.default_hold_hours = input.default_hold_hours;
    if (input.brand_instructions !== undefined) {
      tenant.brand_instructions = input.brand_instructions;
    }
    return this.tenants.save(tenant);
  }

  findAll(): Promise<Tenant[]> {
    return this.tenants.find({ order: { created_at: 'DESC' } });
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  /** Resolve the tenant behind a widget embed key. */
  async findByWidgetKey(widgetKey: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { widget_key: widgetKey, active: true } });
    if (!tenant) throw new NotFoundException('Unknown or inactive widget key');
    return tenant;
  }

  /** Decrypts the ERP key. Call this only when about to make an ERP request. */
  credentialsFor(tenant: Tenant): TenantCredentials {
    return {
      baseUrl: tenant.erp_base_url,
      apiKey: decryptSecret(tenant.erp_api_key_encrypted, this.appSecret),
      companyId: tenant.company_id,
      rateLimitPerMinute: tenant.erp_rate_limit_per_minute,
    };
  }
}
