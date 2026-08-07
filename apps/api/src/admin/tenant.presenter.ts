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
    webhook_url: `${publicBaseUrl}/webhooks/${tenant.id}/inventory-update`,
    created_at: tenant.createdAt,
  };
}

/**
 * The signing secret, served only by the dedicated credentials route.
 *
 * Kept out of TenantView so it cannot ride along in a list response — it was
 * previously returned for every showroom on every page load.
 */
export interface TenantCredentialsView {
  widget_key: string;
  webhook_url: string;
  webhook_secret: string;
}

export function toTenantCredentialsView(
  tenant: Tenant,
  publicBaseUrl: string,
): TenantCredentialsView {
  return {
    widget_key: tenant.widgetKey,
    webhook_url: `${publicBaseUrl}/webhooks/${tenant.id}/inventory-update`,
    webhook_secret: tenant.webhookSecret,
  };
}

/** The showroom's own rules for its assistant. */
export interface AgentRulesView {
  agent_persona: string | null;
  agent_tone: string | null;
  guardrails: string[];
  escalation_rules: string[];
  escalation_contact: string | null;
  allow_holds: boolean;
  allow_quotes: boolean;
  allow_orders: boolean;
  max_hold_hours: number;
  /**
   * Roughly what this configuration adds to every model call, so the cost of a
   * long persona is visible while it is being written rather than on the invoice.
   * Four characters per token is the usual English approximation.
   */
  estimated_prompt_tokens: number;
}

export function toAgentRulesView(tenant: Tenant): AgentRulesView {
  const text = [
    tenant.agentPersona ?? '',
    tenant.agentTone ?? '',
    ...tenant.guardrails,
    ...tenant.escalationRules,
    tenant.escalationContact ?? '',
    tenant.brandInstructions ?? '',
  ].join(' ');

  return {
    agent_persona: tenant.agentPersona,
    agent_tone: tenant.agentTone,
    guardrails: tenant.guardrails,
    escalation_rules: tenant.escalationRules,
    escalation_contact: tenant.escalationContact,
    allow_holds: tenant.allowHolds,
    allow_quotes: tenant.allowQuotes,
    allow_orders: tenant.allowOrders,
    max_hold_hours: tenant.maxHoldHours,
    estimated_prompt_tokens: Math.ceil(text.trim().length / 4),
  };
}

export interface PrivacyView {
  retention_days: number;
  allowed_origins: string[];
  daily_message_cap: number | null;
  monthly_token_budget: number | null;
}

export function toPrivacyView(tenant: Tenant): PrivacyView {
  return {
    retention_days: tenant.retentionDays,
    allowed_origins: tenant.allowedOrigins,
    daily_message_cap: tenant.dailyMessageCap,
    monthly_token_budget: tenant.monthlyTokenBudget,
  };
}
