import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Tenant } from '../prisma';
import { buildSystemBlocks, buildTenantContext } from './system-prompt';

/**
 * Guards the prompt cache, which is worth about two thirds of the input bill.
 *
 * The cached prefix is `tools ++ system[0]`, matched byte for byte and shared by
 * every tenant and every conversation. If anything tenant-specific ever moves
 * above that breakpoint, one shared cache entry becomes one per showroom —
 * which nothing at runtime reports as an error. It shows up weeks later as a
 * bill roughly twelve times larger on the prefix.
 */

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    organisationId: '00000000-0000-0000-0000-000000000001',
    name: 'A Showroom',
    widgetKey: 'wk_test',
    erpBaseUrl: 'http://localhost:4010',
    erpApiKeyEncrypted: 'x:y:z',
    companyId: null,
    webhookSecret: 'whsec_test',
    erpRateLimitPerMinute: 60,
    defaultHoldHours: 24,
    brandInstructions: null,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    agentPersona: null,
    agentTone: null,
    guardrails: [],
    escalationRules: [],
    escalationContact: null,
    allowHolds: true,
    allowQuotes: true,
    allowOrders: true,
    maxHoldHours: 72,
    retentionDays: 365,
    dailyMessageCap: null,
    monthlyTokenBudget: null,
    allowedOrigins: [],
    ...overrides,
  } as Tenant;
}

test('the cached block is byte-identical across wildly different tenants', () => {
  const plain = buildSystemBlocks(tenant());
  const configured = buildSystemBlocks(
    tenant({
      name: 'Another Showroom Entirely',
      agentPersona: 'You are warm, unhurried and never pushy.',
      agentTone: 'formal',
      guardrails: ['Never discuss lab-grown stones.', 'Never promise a delivery date.'],
      escalationRules: ['The customer asks about finance.'],
      escalationContact: 'sales@example.com',
      brandInstructions: 'We offer lifetime buyback over 1 carat.',
      allowHolds: false,
      allowQuotes: false,
      allowOrders: false,
      maxHoldHours: 12,
    }),
  );

  assert.equal(plain[0].text, configured[0].text);
});

test('the cache breakpoint is on the first block and only the first block', () => {
  const blocks = buildSystemBlocks(tenant());

  assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' });
  // A breakpoint on the tenant tail would cache a prefix that changes per
  // showroom — paying the 1.25x write premium for an entry nothing can reuse.
  assert.equal(blocks[1].cache_control, undefined);
});

test('a fully-enabled showroom pays nothing for capabilities it has not disabled', () => {
  const enabled = buildTenantContext(tenant({ name: 'X' }));

  assert.equal(enabled, 'You are representing X.');
});

test('disabled capabilities are stated so the model can decline gracefully', () => {
  const context = buildTenantContext(tenant({ allowOrders: false }));

  assert.match(context, /cannot place orders/);
});

test('every configured rule reaches the model', () => {
  const context = buildTenantContext(
    tenant({
      agentPersona: 'PERSONA-MARKER',
      agentTone: 'TONE-MARKER',
      guardrails: ['GUARDRAIL-MARKER'],
      escalationRules: ['ESCALATION-MARKER'],
      escalationContact: 'CONTACT-MARKER',
      brandInstructions: 'BRAND-MARKER',
    }),
  );

  for (const marker of [
    'PERSONA-MARKER',
    'TONE-MARKER',
    'GUARDRAIL-MARKER',
    'ESCALATION-MARKER',
    'CONTACT-MARKER',
    'BRAND-MARKER',
  ]) {
    assert.ok(context.includes(marker), `${marker} missing from the tenant context`);
  }
});
