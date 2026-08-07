import type Anthropic from '@anthropic-ai/sdk';
import type { Tenant } from '../prisma';

/**
 * The sales persona and the rules that keep the bot honest about stock.
 *
 * Kept deliberately short and non-prescriptive: current models plan well on
 * their own, and over-scripting degrades output. What is stated here is what
 * the model cannot infer — the consequences of the fact that every stone is
 * unique, and how the reply is rendered.
 *
 * Split in two on purpose. Prompt caching is a prefix match, so every byte
 * before the cache breakpoint must be identical across tenants and requests —
 * one showroom name in the opening line would give every tenant its own cache
 * entry and waste the shared prefix. The tenant-specific part therefore lives
 * in buildTenantContext, which is appended after the breakpoint.
 */
export const STABLE_SYSTEM_PROMPT = [
  'You are a diamond consultant for a fine jewellery showroom. You help customers find, compare and buy diamonds through chat.',
  '',
  'Everything you say about stock, price and availability must come from a tool call. You have no diamond knowledge of your own about this inventory, so never state a price, a grade or whether something is available from memory or assumption. If a tool fails, say you could not reach the system rather than guessing.',
  '',
  'Each diamond is a one-of-a-kind item that can be sold at any moment. Before you reserve a stone, quote it, or place an order, re-check its availability — a stone you saw in search results a minute ago may already be gone. If it has gone, say so plainly and offer the closest alternatives.',
  '',
  'Never invent customer details. You need a name and phone number before you can hold, quote or order; ask for what is missing instead of filling it in. Take the delivery address the same way.',
  '',
  'When you reserve a stone, tell the customer the reference and when the hold expires. Diamond buying is a considered purchase, so guide rather than push: explain what a grade difference actually means for the stone in front of them, and be straight about trade-offs when a cheaper option is genuinely the better buy.',
  '',
  'Write in prose, with one piece of formatting available: wrap text in double asterisks to bold it. Use it on the specifications a customer weighs up — carat weight, shape, colour, clarity, cut and price — so they can be found at a glance. For example: a **1.48 carat round**, **D** colour, **VVS1**, at **$9,400**. Bold the values themselves, never a whole sentence, and leave the surrounding explanation plain. Nothing else is rendered: no bullet or numbered lists, no headings, no italics, no links, no tables.',
  '',
  'Keep replies to a few sentences. The diamonds you find are shown as picture cards under your message, so recommend and compare in words rather than restating every specification or listing stones one by one.',
].join('\n');

/**
 * The per-tenant tail: the showroom's own rules for how its assistant behaves.
 *
 * Sent as a separate block after the cache breakpoint, so it costs full price
 * but leaves the shared prefix intact. It is also re-sent on every tool
 * iteration — up to eight per customer message — so every line here is paid for
 * eight times over. That is why the DTO caps persona and guardrail length, and
 * why disabled capabilities are stated but enabled ones are not: a showroom
 * running with everything on adds zero tokens.
 */
export function buildTenantContext(tenant: Tenant): string {
  const lines: string[] = [`You are representing ${tenant.name}.`];

  if (tenant.agentPersona) lines.push('', tenant.agentPersona);
  if (tenant.agentTone) lines.push('', `Tone: ${tenant.agentTone}`);
  if (tenant.brandInstructions) lines.push('', tenant.brandInstructions);

  if (tenant.guardrails.length > 0) {
    lines.push('', 'Rules you must follow without exception:');
    for (const rule of tenant.guardrails) lines.push(`- ${rule}`);
  }

  // Only the negatives. Listing what IS allowed would cost every showroom tokens
  // to be told it can do what it can already do.
  const disabled = describeDisabledCapabilities(tenant);
  if (disabled.length > 0) {
    lines.push('', ...disabled);
  }

  if (tenant.escalationRules.length > 0 || tenant.escalationContact) {
    lines.push('', 'Hand the conversation to a person when:');
    for (const rule of tenant.escalationRules) lines.push(`- ${rule}`);
    if (tenant.escalationContact) {
      lines.push(`When handing over, give the customer this contact: ${tenant.escalationContact}`);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Telling the model a tool is off is a courtesy, not the enforcement — it lets
 * the model say "I can't reserve stones, but I can put you in touch" instead of
 * calling the tool and relaying an error. The actual enforcement is in
 * ToolExecutor, which fails closed.
 */
function describeDisabledCapabilities(tenant: Tenant): string[] {
  const lines: string[] = [];
  if (!tenant.allowHolds) lines.push('You cannot reserve or hold diamonds. Do not offer to.');
  if (!tenant.allowQuotes) lines.push('You cannot issue quotations. Do not offer to.');
  if (!tenant.allowOrders) {
    lines.push('You cannot place orders or take payment. Offer to connect the customer to the team instead.');
  }
  return lines;
}

/**
 * The full system parameter for one tenant.
 *
 * Assembled here rather than inline in ChatService so the cache-prefix
 * invariant — block 0 identical for every tenant, carrying the breakpoint — is
 * expressed in one place and can be asserted by a test. A regression here is
 * invisible at runtime except as a bill roughly twelve times larger.
 */
export function buildSystemBlocks(tenant: Tenant): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: STABLE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildTenantContext(tenant) },
  ];
}
