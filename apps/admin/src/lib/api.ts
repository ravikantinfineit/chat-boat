const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** What the admin API returns for a tenant. The ERP key is never included. */
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
  created_at: string;
}

export interface TenantInput {
  name: string;
  erp_base_url: string;
  erp_api_key?: string;
  company_id?: string;
  erp_rate_limit_per_minute?: number;
  default_hold_hours?: number;
  brand_instructions?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  total_results?: number;
  sample?: unknown;
  error?: string;
}

/** Raised on 401 so the auth context can send the user back to the login page. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // The session is an httpOnly cookie, so it must be sent explicitly on these
    // cross-origin calls. Nothing is kept in localStorage — an XSS in this app
    // must not be able to read the credential.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (response.status === 401) throw new UnauthenticatedError();
  if (!response.ok) {
    const body = await response.text();
    let message = body.slice(0, 300);
    try {
      message = (JSON.parse(body).message as string) ?? message;
    } catch {
      // not JSON; keep the raw text
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  platformRole: string | null;
  organisationId: string | null;
  organisationName: string | null;
  role: 'owner' | 'admin' | 'member' | null;
}

export interface Overview {
  showrooms: number;
  conversations: number;
  messages: number;
  activeHolds: number;
  perShowroom: { id: string; name: string; erp_base_url: string; conversations: number }[];
}

export interface ConversationRow {
  id: string;
  channel: string;
  customerName: string | null;
  createdAt: string;
  _count?: { messages: number };
}

export interface HoldRow {
  id: string;
  erpHoldId: string;
  diamondId: string;
  customerName: string;
  expiresAt: string;
  status: string;
}

export interface TenantCredentials {
  widget_key: string;
  webhook_url: string;
  webhook_secret: string;
}

export interface AgentRules {
  agent_persona: string | null;
  agent_tone: string | null;
  guardrails: string[];
  escalation_rules: string[];
  escalation_contact: string | null;
  allow_holds: boolean;
  allow_quotes: boolean;
  allow_orders: boolean;
  max_hold_hours: number;
  estimated_prompt_tokens: number;
}

export interface PrivacySettings {
  retention_days: number;
  allowed_origins: string[];
  daily_message_cap: number | null;
  monthly_token_budget: number | null;
}

export interface Usage {
  conversations: number;
  visitors: number;
  messages: number;
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number; total: number };
  cacheHitRate: number;
  estimatedCostUsd: number;
  funnel: { tool: string; calls: number; failures: number }[];
  daily: { date: string; messages: number; tokens: number; costUsd: number }[];
}

export interface Transcript {
  id: string;
  channel: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  messages: { id: string; role: 'user' | 'assistant'; content: unknown; createdAt: string }[];
}

export interface AuditRow {
  id: string;
  action: string;
  actorEmail: string;
  target: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CustomerRecord {
  conversations: { id: string; createdAt: string; messages: number; customerName: string | null }[];
  holds: { id: string; erpHoldId: string; diamondId: string; status: string; createdAt: string }[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: true }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/auth/me'),
  credentials: (id: string) => request<TenantCredentials>(`/admin/tenants/${id}/credentials`),
  overview: () => request<Overview>('/admin/overview'),
  conversations: (id: string) => request<ConversationRow[]>(`/admin/tenants/${id}/conversations`),
  holds: (id: string) => request<HoldRow[]>(`/admin/tenants/${id}/holds`),
  listTenants: () => request<TenantView[]>('/admin/tenants'),
  getTenant: (id: string) => request<TenantView>(`/admin/tenants/${id}`),
  createTenant: (input: TenantInput) =>
    request<TenantView>('/admin/tenants', { method: 'POST', body: JSON.stringify(input) }),
  updateTenant: (id: string, input: TenantInput) =>
    request<TenantView>(`/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  testConnection: (id: string) =>
    request<ConnectionTestResult>(`/admin/tenants/${id}/test-connection`, { method: 'POST' }),

  agentRules: (id: string) => request<AgentRules>(`/admin/tenants/${id}/agent-rules`),
  updateAgentRules: (id: string, input: Partial<AgentRules>) =>
    request<AgentRules>(`/admin/tenants/${id}/agent-rules`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  privacy: (id: string) => request<PrivacySettings>(`/admin/tenants/${id}/privacy`),
  updatePrivacy: (id: string, input: Partial<PrivacySettings>) =>
    request<PrivacySettings>(`/admin/tenants/${id}/privacy`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  usage: (id: string, days = 30) => request<Usage>(`/admin/tenants/${id}/usage?days=${days}`),
  transcript: (id: string, conversationId: string) =>
    request<Transcript>(`/admin/tenants/${id}/conversations/${conversationId}`),

  auditLog: () => request<AuditRow[]>('/admin/audit'),
  customerLookup: (id: string, term: string, kind: 'phone' | 'email') =>
    request<CustomerRecord>(`/admin/tenants/${id}/privacy/customer-lookup`, {
      method: 'POST',
      body: JSON.stringify({ term, kind }),
    }),
  eraseCustomer: (id: string, term: string, kind: 'phone' | 'email') =>
    request<{ conversations: number; messages: number; holds: number }>(
      `/admin/tenants/${id}/privacy/erase-customer`,
      { method: 'POST', body: JSON.stringify({ term, kind }) },
    ),
};
