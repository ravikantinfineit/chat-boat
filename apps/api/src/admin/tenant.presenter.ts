import type { Tenant } from '../prisma';

/** What the admin panel sees. Never includes the encrypted ERP key. */
export interface TenantView {
  id: string;
  name: string;
  erp_base_url: string;
  company_id: string | null;
  erp_rate_limit_per_minute: number;
  default_hold_hours: number;
  brand_instructions: string | null;
  active: boolean;
  widget_key: string;
  webhook_url: string;
  webhook_secret: string;
  created_at: Date;
}

/**
 * Maps a tenant row onto the admin API shape.
 *
 * Kept apart from the controller so there is exactly one place where a new
 * column has to be consciously opted in to — the ERP key must never leak by
 * someone returning the record directly.
 */
export function toTenantView(tenant: Tenant, publicBaseUrl: string): TenantView {
  return {
    id: tenant.id,
    name: tenant.name,
    erp_base_url: tenant.erpBaseUrl,
    company_id: tenant.companyId,
    erp_rate_limit_per_minute: tenant.erpRateLimitPerMinute,
    default_hold_hours: tenant.defaultHoldHours,
    brand_instructions: tenant.brandInstructions,
    active: tenant.active,
    widget_key: tenant.widgetKey,
    /** Hand these two to the dealer's developer for spec 3.11. */
    webhook_url: `${publicBaseUrl}/webhooks/${tenant.id}/inventory-update`,
    webhook_secret: tenant.webhookSecret,
    created_at: tenant.createdAt,
  };
}
