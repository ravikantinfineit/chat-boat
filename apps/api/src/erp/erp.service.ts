import { Injectable, Logger } from '@nestjs/common';
import type {
  AvailabilityResponse,
  CompareDiamondsResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateQuotationRequest,
  CreateQuotationResponse,
  GetDiamondResponse,
  HoldDiamondRequest,
  HoldDiamondResponse,
  OrderStatusResponse,
  SearchDiamondsParams,
  SearchDiamondsResponse,
} from '@diamond/shared';
import { Tenant } from '../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { RateLimiterRegistry } from './rate-limiter';

/** Thrown when the dealer's ERP rejects or fails a request. */
export class ErpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'ErpError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Talks to the dealer's existing software over the contract in spec section 3.
 *
 * We hold no diamond data of our own — every answer the bot gives about stock
 * or price ultimately comes from one of these calls.
 */
@Injectable()
export class ErpService {
  private readonly logger = new Logger(ErpService.name);
  private readonly limiters = new RateLimiterRegistry();

  constructor(private readonly tenants: TenantService) {}

  // --- endpoints (spec 3.2 - 3.10) ------------------------------------------

  searchDiamonds(tenant: Tenant, params: SearchDiamondsParams): Promise<SearchDiamondsResponse> {
    return this.request<SearchDiamondsResponse>(tenant, {
      path: '/api/diamonds/search',
      query: params as Record<string, string | number | undefined>,
    });
  }

  getDiamond(tenant: Tenant, diamondId: string): Promise<GetDiamondResponse> {
    return this.request<GetDiamondResponse>(tenant, {
      path: `/api/diamonds/${encodeURIComponent(diamondId)}`,
    });
  }

  /**
   * Spec 3.4 — the live re-check. Diamonds are one-of-a-kind, so this must run
   * immediately before any hold, quotation or order; a search result seconds old
   * is not proof the stone is still available.
   */
  checkAvailability(tenant: Tenant, diamondId: string): Promise<AvailabilityResponse> {
    return this.request<AvailabilityResponse>(tenant, {
      path: `/api/diamonds/${encodeURIComponent(diamondId)}/availability`,
    });
  }

  compareDiamonds(tenant: Tenant, diamondIds: string[]): Promise<CompareDiamondsResponse> {
    return this.request<CompareDiamondsResponse>(tenant, {
      method: 'POST',
      path: '/api/diamonds/compare',
      body: { diamond_ids: diamondIds },
    });
  }

  holdDiamond(
    tenant: Tenant,
    diamondId: string,
    body: HoldDiamondRequest,
  ): Promise<HoldDiamondResponse> {
    return this.request<HoldDiamondResponse>(tenant, {
      method: 'POST',
      path: `/api/diamonds/${encodeURIComponent(diamondId)}/hold`,
      body,
    });
  }

  releaseHold(tenant: Tenant, diamondId: string, holdId: string): Promise<unknown> {
    return this.request(tenant, {
      method: 'POST',
      path: `/api/diamonds/${encodeURIComponent(diamondId)}/release`,
      body: { hold_id: holdId },
    });
  }

  createQuotation(tenant: Tenant, body: CreateQuotationRequest): Promise<CreateQuotationResponse> {
    return this.request<CreateQuotationResponse>(tenant, {
      method: 'POST',
      path: '/api/quotations',
      body,
    });
  }

  createOrder(tenant: Tenant, body: CreateOrderRequest): Promise<CreateOrderResponse> {
    return this.request<CreateOrderResponse>(tenant, {
      method: 'POST',
      path: '/api/orders',
      body,
    });
  }

  getOrderStatus(tenant: Tenant, orderId: string): Promise<OrderStatusResponse> {
    return this.request<OrderStatusResponse>(tenant, {
      path: `/api/orders/${encodeURIComponent(orderId)}`,
    });
  }

  // --- transport ------------------------------------------------------------

  private async request<T>(tenant: Tenant, options: RequestOptions): Promise<T> {
    const creds = this.tenants.credentialsFor(tenant);
    const limiter = this.limiters.for(tenant.id, creds.rateLimitPerMinute);

    const url = new URL(creds.baseUrl + options.path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      // Spec 3.1 — proves the request genuinely came from the chatbot platform.
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
    };
    if (creds.companyId) headers['X-Company-ID'] = creds.companyId;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await limiter.acquire();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        // Spec 6: respect 429 and retry politely.
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const waitMs = this.retryDelayMs(response.headers.get('retry-after'), attempt);
          this.logger.warn(
            `ERP rate limited (tenant=${tenant.id} path=${options.path}); retrying in ${waitMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        // Transient server-side failures are worth one more try; 4xx are not.
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs(null, attempt)));
          continue;
        }

        const text = await response.text();
        if (!response.ok) {
          throw new ErpError(
            `ERP responded ${response.status} for ${options.path}`,
            response.status,
            text.slice(0, 500),
          );
        }
        return (text ? JSON.parse(text) : {}) as T;
      } catch (error) {
        lastError = error;
        // A failed request contract (4xx) is final — don't burn retries on it.
        if (error instanceof ErpError) throw error;
        if (attempt >= MAX_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs(null, attempt)));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ErpError(
      `Could not reach the ERP at ${options.path}: ${(lastError as Error)?.message ?? 'unknown error'}`,
      0,
    );
  }

  /** Honour Retry-After when present, otherwise exponential backoff with jitter. */
  private retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    }
    const base = 500 * 2 ** attempt;
    return Math.min(base + Math.random() * 250, 10_000);
  }
}
