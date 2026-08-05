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
  webhook_secret: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export const api = {
  listTenants: () => request<TenantView[]>('/admin/tenants'),
  getTenant: (id: string) => request<TenantView>(`/admin/tenants/${id}`),
  createTenant: (input: TenantInput) =>
    request<TenantView>('/admin/tenants', { method: 'POST', body: JSON.stringify(input) }),
  updateTenant: (id: string, input: TenantInput) =>
    request<TenantView>(`/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  testConnection: (id: string) =>
    request<ConnectionTestResult>(`/admin/tenants/${id}/test-connection`, { method: 'POST' }),
  holds: (id: string) => request<unknown[]>(`/admin/tenants/${id}/holds`),
  conversations: (id: string) => request<unknown[]>(`/admin/tenants/${id}/conversations`),
};
