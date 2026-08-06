import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type {
  GetDiamondResponse,
  InventoryUpdateWebhookPayload,
  SearchDiamondsParams,
  SearchDiamondsResponse,
} from '@diamond/shared';
import type { Tenant } from '../prisma';
import { ErpService } from '../erp/erp.service';
import { REDIS_CLIENT } from './redis.provider';

/**
 * A thin read-through cache in front of the dealer's search and detail
 * endpoints (spec 3.11: "keeps the chatbot's cached search index fresh without
 * needing to call your search API on every single message").
 *
 * Deliberately short TTLs, and deliberately NOT used for availability: browsing
 * is served from cache, but the moment of commitment always hits the ERP live.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  /** Browsing tolerates slightly stale data; a minute keeps it responsive. */
  private static readonly SEARCH_TTL_SECONDS = 60;
  private static readonly DETAIL_TTL_SECONDS = 300;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly erp: ErpService,
  ) {}

  async search(tenant: Tenant, params: SearchDiamondsParams): Promise<SearchDiamondsResponse> {
    const key = this.searchKey(tenant.id, params);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as SearchDiamondsResponse;

    const fresh = await this.erp.searchDiamonds(tenant, params);
    await this.redis.set(key, JSON.stringify(fresh), 'EX', CatalogService.SEARCH_TTL_SECONDS);
    // Track this tenant's search keys so a webhook can invalidate them wholesale.
    await this.redis.sadd(this.searchIndexKey(tenant.id), key);
    return fresh;
  }

  async getDiamond(tenant: Tenant, diamondId: string): Promise<GetDiamondResponse> {
    const key = this.detailKey(tenant.id, diamondId);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as GetDiamondResponse;

    const fresh = await this.erp.getDiamond(tenant, diamondId);
    await this.redis.set(key, JSON.stringify(fresh), 'EX', CatalogService.DETAIL_TTL_SECONDS);
    return fresh;
  }

  /**
   * Applied when the dealer's system pushes a stock or price change (spec 3.11).
   * We drop the affected detail entry and every cached search page for that
   * tenant — a sold stone must not keep appearing in results.
   */
  async applyInventoryUpdate(tenant: Tenant, update: InventoryUpdateWebhookPayload): Promise<void> {
    await this.redis.del(this.detailKey(tenant.id, update.diamond_id));
    await this.invalidateSearches(tenant.id);
    this.logger.log(
      `Inventory update for ${update.diamond_id} (${update.stock_status}, ${update.price}) — caches cleared`,
    );
  }

  async invalidateSearches(tenantId: string): Promise<void> {
    const indexKey = this.searchIndexKey(tenantId);
    const keys = await this.redis.smembers(indexKey);
    if (keys.length > 0) await this.redis.del(...keys);
    await this.redis.del(indexKey);
  }

  private searchKey(tenantId: string, params: SearchDiamondsParams): string {
    // Sort the params so equivalent searches share one cache entry.
    const normalised = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `catalog:${tenantId}:search:${normalised}`;
  }

  private searchIndexKey(tenantId: string): string {
    return `catalog:${tenantId}:search-keys`;
  }

  private detailKey(tenantId: string, diamondId: string): string {
    return `catalog:${tenantId}:diamond:${diamondId}`;
  }
}
