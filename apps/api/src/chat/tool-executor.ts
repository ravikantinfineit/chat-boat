import { Injectable, Logger } from '@nestjs/common';
import type { ChatStreamEvent } from '@diamond/shared';
import { toModelDiamond, toModelSummary } from '@diamond/shared';
import { CatalogService } from '../catalog/catalog.service';
import { DiamondUnavailableError, ErpUnavailableError } from '../common/errors';
import { ErpService } from '../erp/erp.service';
import { HoldsService } from '../holds/holds.service';
import type { Conversation, Tenant } from '../prisma';

export interface ToolOutcome {
  /** JSON returned to the model as the tool_result content. */
  result: unknown;
  /** True when the tool failed — sent back with is_error so the model can adapt. */
  isError?: boolean;
  /** Structured events pushed to the widget alongside the model's prose. */
  events: ChatStreamEvent[];
  /** Contact details the model captured, persisted onto the conversation. */
  customer?: { name?: string; phone?: string; email?: string };
}

/**
 * Runs one tool call against the dealer's system.
 *
 * Browsing goes through the Redis-cached catalog; anything that commits
 * (availability, hold, quote, order) goes straight to the ERP.
 */
@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly erp: ErpService,
    private readonly catalog: CatalogService,
    private readonly holds: HoldsService,
  ) {}

  async execute(
    tenant: Tenant,
    conversation: Conversation,
    name: string,
    input: Record<string, any>,
  ): Promise<ToolOutcome> {
    try {
      return await this.dispatch(tenant, conversation, name, input);
    } catch (error) {
      // Tool failures are handed back to the model rather than thrown, so it can
      // apologise or try a different approach instead of the turn dying.
      if (error instanceof DiamondUnavailableError) {
        return {
          result: {
            error: 'diamond_unavailable',
            message: `Diamond ${error.diamondId} is no longer available (${error.stockStatus}). Offer the customer similar alternatives.`,
          },
          isError: true,
          events: [],
        };
      }
      if (error instanceof ErpUnavailableError) {
        this.logger.error(`Tool ${name} failed: ${error.message}`);
        return {
          result: {
            error: 'erp_unavailable',
            message: `The inventory system did not respond correctly (${error.status}). Tell the customer you could not reach the system and offer to follow up.`,
          },
          isError: true,
          events: [],
        };
      }
      this.logger.error(`Tool ${name} threw: ${(error as Error).message}`);
      return {
        result: { error: 'internal_error', message: 'The tool failed unexpectedly.' },
        isError: true,
        events: [],
      };
    }
  }

  private async dispatch(
    tenant: Tenant,
    conversation: Conversation,
    name: string,
    input: Record<string, any>,
  ): Promise<ToolOutcome> {
    switch (name) {
      case 'search_diamonds': {
        const response = await this.catalog.search(tenant, {
          ...input,
          // Ceiling as well as default: without it the model can ask for 50 and
          // the default never fires.
          limit: Math.min(input.limit ?? 6, 10),
          // The customer is shopping — never surface sold or reserved stones.
          stock_status: 'In Stock',
        });
        // The model gets the trimmed projection; the widget's cards keep the
        // full objects, including the images it renders.
        return {
          result: { ...response, results: response.results.map(toModelSummary) },
          events: [{ type: 'cards', diamonds: response.results }],
        };
      }

      case 'get_diamond_details': {
        const diamond = await this.catalog.getDiamond(tenant, input.diamond_id);
        return {
          result: toModelDiamond(diamond),
          events: [{ type: 'cards', diamonds: [diamond] }],
        };
      }

      case 'check_availability': {
        // Deliberately uncached — this is the pre-commitment truth check.
        const availability = await this.erp.checkAvailability(tenant, input.diamond_id);
        return { result: availability, events: [] };
      }

      case 'compare_diamonds': {
        const diamonds = await this.erp.compareDiamonds(tenant, input.diamond_ids);
        return {
          result: diamonds.map(toModelDiamond),
          events: [{ type: 'comparison', diamonds }],
        };
      }

      case 'hold_diamond': {
        if (!tenant.allowHolds) return capabilityDisabled('reserve diamonds');
        const response = await this.holds.createHold(
          tenant,
          input.diamond_id,
          {
            customer_name: input.customer_name,
            customer_phone: input.customer_phone,
            customer_email: input.customer_email,
            // Clamped, not rejected: a customer asking for a fortnight still
            // gets a hold, just the longest one this showroom allows.
            hold_duration_hours: Math.min(
              input.hold_duration_hours ?? tenant.defaultHoldHours,
              tenant.maxHoldHours,
            ),
            notes: input.notes ?? 'Requested via chatbot',
          },
          conversation.id,
        );
        return {
          result: response,
          events: [{ type: 'receipt', kind: 'hold', data: response as unknown as Record<string, unknown> }],
          customer: {
            name: input.customer_name,
            phone: input.customer_phone,
            email: input.customer_email,
          },
        };
      }

      case 'release_hold': {
        if (!tenant.allowHolds) return capabilityDisabled('reserve diamonds');
        await this.holds.releaseHold(tenant, input.diamond_id, input.hold_id);
        return { result: { released: true, hold_id: input.hold_id }, events: [] };
      }

      case 'create_quotation': {
        if (!tenant.allowQuotes) return capabilityDisabled('issue quotations');
        const response = await this.erp.createQuotation(tenant, {
          diamond_ids: input.diamond_ids,
          customer_name: input.customer_name,
          customer_phone: input.customer_phone,
          customer_email: input.customer_email,
          valid_for_days: input.valid_for_days ?? 7,
        });
        return {
          result: response,
          events: [
            { type: 'receipt', kind: 'quotation', data: response as unknown as Record<string, unknown> },
          ],
          customer: {
            name: input.customer_name,
            phone: input.customer_phone,
            email: input.customer_email,
          },
        };
      }

      case 'place_order': {
        if (!tenant.allowOrders) return capabilityDisabled('place orders or take payment');
        // Re-verify every stone before taking money for it.
        for (const diamondId of input.diamond_ids as string[]) {
          const availability = await this.erp.checkAvailability(tenant, diamondId);
          if (availability.stock_status !== 'In Stock') {
            throw new DiamondUnavailableError(diamondId, availability.stock_status);
          }
        }
        const response = await this.erp.createOrder(tenant, {
          diamond_ids: input.diamond_ids,
          customer_name: input.customer_name,
          customer_phone: input.customer_phone,
          customer_email: input.customer_email,
          delivery_address: input.delivery_address,
          quotation_id: input.quotation_id,
          payment_status: 'Pending',
        });
        return {
          result: response,
          events: [
            { type: 'receipt', kind: 'order', data: response as unknown as Record<string, unknown> },
          ],
          customer: {
            name: input.customer_name,
            phone: input.customer_phone,
            email: input.customer_email,
          },
        };
      }

      case 'get_order_status': {
        if (!tenant.allowOrders) return capabilityDisabled('place orders or take payment');
        const response = await this.erp.getOrderStatus(tenant, input.order_id);
        return { result: response, events: [] };
      }

      default:
        return {
          result: { error: 'unknown_tool', message: `No such tool: ${name}` },
          isError: true,
          events: [],
        };
    }
  }
}

/**
 * Where a showroom's capability toggles are actually enforced.
 *
 * Deliberately here rather than by filtering the tool list handed to the model.
 * Tools serialise BEFORE the prompt cache breakpoint, so a per-tenant tool array
 * would split one platform-wide cache entry into one per combination — punishing
 * exactly the quiet showrooms whose caches never stay warm.
 *
 * It also fails in the right direction. A forgotten filter fails open and the
 * call reaches the dealer's ERP; a forgotten guard here is a missing line in a
 * switch that reviewers can see, and every path that commits anything has one.
 */
function capabilityDisabled(what: string): ToolOutcome {
  return {
    result: {
      error: 'capability_disabled',
      message: `This showroom has not enabled you to ${what}. Tell the customer you cannot do that here and offer to pass them to the team.`,
    },
    isError: true,
    events: [],
  };
}
