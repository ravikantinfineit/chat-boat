import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Conversation, Tenant } from '../prisma';
import { ToolExecutor } from './tool-executor';

/**
 * Proves a switched-off capability is refused *before* anything reaches the
 * dealer's ERP.
 *
 * The services are deliberately null. If a disabled capability ever stops
 * failing closed, the guard falls through and the call dies on a null service —
 * so this test fails loudly rather than quietly letting an order through for a
 * showroom that turned ordering off.
 */
const nothing = null as never;
const executor = new ToolExecutor(nothing, nothing, nothing);

function tenant(overrides: Partial<Tenant>): Tenant {
  return {
    id: 't',
    name: 'Showroom',
    defaultHoldHours: 24,
    maxHoldHours: 72,
    allowHolds: true,
    allowQuotes: true,
    allowOrders: true,
    ...overrides,
  } as Tenant;
}

const conversation = { id: 'c', tenantId: 't' } as Conversation;

const CASES: { tool: string; off: Partial<Tenant>; input: Record<string, unknown> }[] = [
  { tool: 'hold_diamond', off: { allowHolds: false }, input: { diamond_id: 'D1' } },
  { tool: 'release_hold', off: { allowHolds: false }, input: { hold_id: 'H1' } },
  { tool: 'create_quotation', off: { allowQuotes: false }, input: { diamond_ids: ['D1'] } },
  { tool: 'place_order', off: { allowOrders: false }, input: { diamond_ids: ['D1'] } },
  { tool: 'get_order_status', off: { allowOrders: false }, input: { order_id: 'O1' } },
];

for (const testCase of CASES) {
  test(`${testCase.tool} is refused when its capability is off`, async () => {
    const outcome = await executor.execute(
      tenant(testCase.off),
      conversation,
      testCase.tool,
      testCase.input,
    );

    assert.equal(outcome.isError, true);
    assert.equal((outcome.result as { error: string }).error, 'capability_disabled');
    // The refusal goes back to the model, not to the customer as a dead end —
    // it should be able to explain itself in the same turn.
    assert.match((outcome.result as { message: string }).message, /contact|team/i);
  });
}

test('an unknown tool is reported rather than thrown', async () => {
  const outcome = await executor.execute(tenant({}), conversation, 'nonexistent_tool', {});

  assert.equal(outcome.isError, true);
  assert.equal((outcome.result as { error: string }).error, 'unknown_tool');
});
