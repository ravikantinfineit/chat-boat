import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AvailabilityResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateQuotationRequest,
  CreateQuotationResponse,
  Diamond,
  DiamondSummary,
  HoldDiamondRequest,
  HoldDiamondResponse,
  OrderStatusResponse,
  SearchDiamondsParams,
  SearchDiamondsResponse,
  StockStatus,
} from '@diamond/shared';

/** D is the finest colour, so a lower index is a better grade. */
const COLOR_SCALE = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const CLARITY_SCALE = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];

interface HoldRecord {
  hold_id: string;
  diamond_id: string;
  customer_name: string;
  customer_phone: string;
  expires_at: string;
}

export class DiamondNotFoundError extends Error {}
export class DiamondUnavailableError extends Error {
  constructor(readonly status: StockStatus) {
    super(`Diamond is ${status}`);
  }
}

/**
 * Holds the inventory in memory, seeded from data/diamonds.json.
 *
 * Writes (hold, release, order) mutate the in-memory copy only — the file is
 * never rewritten, so every restart returns to a known state and the fixture
 * stays clean in git. POST /api/_test/reset reloads it mid-run.
 */
@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger(InventoryService.name);
  private diamonds = new Map<string, Diamond>();
  private readonly holds = new Map<string, HoldRecord>();
  private readonly orders = new Map<string, CreateOrderResponse & { tracking_number: string }>();
  private sequence = 10000;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.load();
  }

  /** Reload the fixture from disk, discarding any holds and orders. */
  load(): number {
    const path =
      this.config.get<string>('ERP_MOCK_DATA_FILE') ??
      join(__dirname, '..', '..', 'data', 'diamonds.json');

    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Diamond[];
    this.diamonds = new Map(parsed.map((d) => [d.diamond_id, { ...d }]));
    this.holds.clear();
    this.orders.clear();
    this.logger.log(`Loaded ${this.diamonds.size} diamonds from ${path}`);
    return this.diamonds.size;
  }

  // --- reads ----------------------------------------------------------------

  search(params: SearchDiamondsParams): SearchDiamondsResponse {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(Math.max(1, Number(params.limit ?? 10)), 100);

    let results = [...this.diamonds.values()];

    if (params.shape) {
      results = results.filter((d) => d.shape?.toLowerCase() === params.shape!.toLowerCase());
    }
    if (params.cut) {
      results = results.filter((d) => d.cut?.toLowerCase() === params.cut!.toLowerCase());
    }
    if (params.diamond_type) {
      results = results.filter(
        (d) => d.diamond_type?.toLowerCase() === params.diamond_type!.toLowerCase(),
      );
    }
    if (params.stock_status) {
      results = results.filter((d) => d.stock_status === params.stock_status);
    }
    if (params.carat_min !== undefined) results = results.filter((d) => d.carat >= params.carat_min!);
    if (params.carat_max !== undefined) results = results.filter((d) => d.carat <= params.carat_max!);
    if (params.price_min !== undefined) results = results.filter((d) => d.price >= params.price_min!);
    if (params.price_max !== undefined) results = results.filter((d) => d.price <= params.price_max!);

    // Colour and clarity are ordered scales — "F to H" is an index range, not a
    // string comparison.
    const colorMin = this.gradeIndex(COLOR_SCALE, params.color_min);
    if (colorMin >= 0) results = results.filter((d) => COLOR_SCALE.indexOf(d.color ?? '') >= colorMin);
    const colorMax = this.gradeIndex(COLOR_SCALE, params.color_max);
    if (colorMax >= 0) results = results.filter((d) => COLOR_SCALE.indexOf(d.color ?? '') <= colorMax);
    const clarityMin = this.gradeIndex(CLARITY_SCALE, params.clarity_min);
    if (clarityMin >= 0) {
      results = results.filter((d) => CLARITY_SCALE.indexOf(d.clarity ?? '') <= clarityMin);
    }

    results.sort((a, b) => a.price - b.price);
    const start = (page - 1) * limit;

    return {
      total_results: results.length,
      page,
      results: results.slice(start, start + limit).map((d) => this.toSummary(d)),
    };
  }

  get(diamondId: string): Diamond {
    const diamond = this.diamonds.get(diamondId);
    if (!diamond) throw new DiamondNotFoundError(diamondId);
    return diamond;
  }

  availability(diamondId: string): AvailabilityResponse {
    const d = this.get(diamondId);
    return {
      diamond_id: d.diamond_id,
      stock_status: d.stock_status,
      price: d.price,
      currency: d.currency,
      last_updated: new Date().toISOString(),
    };
  }

  compare(diamondIds: string[]): Diamond[] {
    return diamondIds.map((id) => this.diamonds.get(id)).filter((d): d is Diamond => Boolean(d));
  }

  // --- writes ---------------------------------------------------------------

  hold(diamondId: string, body: HoldDiamondRequest): HoldDiamondResponse {
    const diamond = this.get(diamondId);
    if (diamond.stock_status !== 'In Stock') {
      throw new DiamondUnavailableError(diamond.stock_status);
    }

    const hours = Number(body.hold_duration_hours ?? 24);
    const holdId = `HOLD-${this.sequence++}`;
    const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

    diamond.stock_status = 'Reserved';
    this.holds.set(holdId, {
      hold_id: holdId,
      diamond_id: diamondId,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      expires_at: expiresAt,
    });

    return { hold_id: holdId, diamond_id: diamondId, status: 'Held', expires_at: expiresAt };
  }

  release(diamondId: string, holdId: string): { released: boolean; hold_id: string } {
    const diamond = this.get(diamondId);
    if (!this.holds.delete(holdId)) {
      throw new DiamondNotFoundError(`Hold ${holdId} not found`);
    }
    diamond.stock_status = 'In Stock';
    return { released: true, hold_id: holdId };
  }

  quote(body: CreateQuotationRequest): CreateQuotationResponse {
    const total = body.diamond_ids.reduce((sum, id) => sum + (this.diamonds.get(id)?.price ?? 0), 0);
    const quotationId = `QT-${this.sequence++}`;
    const days = Number(body.valid_for_days ?? 7);
    return {
      quotation_id: quotationId,
      pdf_url: `https://quotes.example.com/${quotationId}.pdf`,
      total_amount: total,
      currency: 'USD',
      valid_until: new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10),
    };
  }

  order(body: CreateOrderRequest): CreateOrderResponse {
    // Reject the whole order if any stone has gone; a partial sale is worse.
    for (const id of body.diamond_ids) {
      const d = this.get(id);
      const heldForThisCustomer = [...this.holds.values()].some((h) => h.diamond_id === id);
      if (d.stock_status === 'Sold' || (d.stock_status !== 'In Stock' && !heldForThisCustomer)) {
        throw new DiamondUnavailableError(d.stock_status);
      }
    }

    const total = body.diamond_ids.reduce((sum, id) => sum + this.get(id).price, 0);
    const orderId = `ORD-${this.sequence++}`;

    for (const id of body.diamond_ids) {
      this.get(id).stock_status = 'Sold';
      for (const [holdId, hold] of this.holds) {
        if (hold.diamond_id === id) this.holds.delete(holdId);
      }
    }

    const order = {
      order_id: orderId,
      status: 'Confirmed',
      total_amount: total,
      currency: 'USD',
      estimated_delivery: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      tracking_number: `IN${this.sequence++}0000`,
    };
    this.orders.set(orderId, order);
    return order;
  }

  orderStatus(orderId: string): OrderStatusResponse {
    const order = this.orders.get(orderId);
    if (!order) throw new DiamondNotFoundError(`Order ${orderId} not found`);
    return {
      order_id: order.order_id,
      status: 'Shipped',
      tracking_number: order.tracking_number,
      estimated_delivery: order.estimated_delivery,
    };
  }

  // --- helpers --------------------------------------------------------------

  private gradeIndex(scale: string[], value?: string): number {
    return value ? scale.indexOf(value.toUpperCase()) : -1;
  }

  private toSummary(d: Diamond): DiamondSummary {
    return {
      diamond_id: d.diamond_id,
      shape: d.shape,
      carat: d.carat,
      color: d.color,
      clarity: d.clarity,
      cut: d.cut,
      price: d.price,
      currency: d.currency,
      stock_status: d.stock_status,
      image_urls: d.image_urls,
      certificate_no: d.certificate_no,
    };
  }
}
