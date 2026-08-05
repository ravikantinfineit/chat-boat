/**
 * The API contract the client's existing software exposes — spec section 3.
 *
 * Every request the chatbot makes carries:
 *   Authorization: Bearer <api_key>
 *   X-Company-ID:  <company id>   (multi-showroom / multi-branch routing)
 *
 * All responses are JSON, UTF-8. Timestamps are ISO 8601 with timezone.
 */

import type { Diamond, DiamondSummary, StockStatus } from './diamond';

/** Spec 3.2 — GET /api/diamonds/search. Every parameter is optional. */
export interface SearchDiamondsParams {
  shape?: string;
  carat_min?: number;
  carat_max?: number;
  color_min?: string;
  color_max?: string;
  clarity_min?: string;
  price_min?: number;
  price_max?: number;
  cut?: string;
  diamond_type?: string;
  stock_status?: string;
  page?: number;
  limit?: number;
}

export interface SearchDiamondsResponse {
  total_results: number;
  page: number;
  results: DiamondSummary[];
}

/** Spec 3.3 — GET /api/diamonds/{diamond_id}. */
export type GetDiamondResponse = Diamond;

/** Spec 3.4 — GET /api/diamonds/{diamond_id}/availability. */
export interface AvailabilityResponse {
  diamond_id: string;
  stock_status: StockStatus;
  price: number;
  currency: string;
  /** ISO 8601 with timezone, e.g. "2026-08-05T10:15:00Z". */
  last_updated: string;
}

/** Spec 3.5 — POST /api/diamonds/compare. */
export interface CompareDiamondsRequest {
  diamond_ids: string[];
}
export type CompareDiamondsResponse = Diamond[];

/** Spec 3.6 — POST /api/diamonds/{diamond_id}/hold. */
export interface HoldDiamondRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  hold_duration_hours: number;
  notes?: string;
}

export interface HoldDiamondResponse {
  hold_id: string;
  diamond_id: string;
  status: string;
  /** ISO 8601. The ERP auto-releases the hold at this time if no order lands. */
  expires_at: string;
}

/** Spec 3.7 — POST /api/diamonds/{diamond_id}/release. */
export interface ReleaseHoldRequest {
  hold_id: string;
}

/** Spec 3.8 — POST /api/quotations. */
export interface CreateQuotationRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  diamond_ids: string[];
  valid_for_days: number;
}

export interface CreateQuotationResponse {
  quotation_id: string;
  /** The ERP renders the PDF in its own format; the bot just shares the link. */
  pdf_url: string;
  total_amount: number;
  currency: string;
  /** ISO date, e.g. "2026-08-12". */
  valid_until: string;
}

/** Spec 3.9 — POST /api/orders. */
export interface CreateOrderRequest {
  diamond_ids: string[];
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  quotation_id?: string;
  payment_status?: string;
}

export interface CreateOrderResponse {
  order_id: string;
  status: string;
  total_amount: number;
  currency: string;
  estimated_delivery: string;
}

/** Spec 3.10 — GET /api/orders/{order_id}. */
export interface OrderStatusResponse {
  order_id: string;
  status: string;
  tracking_number?: string;
  estimated_delivery?: string;
}

/**
 * Spec 3.11 — optional webhook the ERP calls whenever a diamond's price or
 * stock changes. Keeps our cached search index fresh so we don't have to hit
 * the client's search API on every single message.
 */
export interface InventoryUpdateWebhookPayload {
  diamond_id: string;
  stock_status: StockStatus;
  price: number;
  updated_at: string;
}
