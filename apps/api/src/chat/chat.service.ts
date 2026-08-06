import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatStreamEvent } from '@diamond/shared';
import { Prisma, PrismaService, Role, type Conversation, type Tenant } from '../prisma';
import { STABLE_SYSTEM_PROMPT, buildTenantContext } from './system-prompt';
import { ToolExecutor } from './tool-executor';
import { DIAMOND_TOOLS, TOOL_LABELS } from './tools';

/** Safety net against a tool loop that never settles. */
const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 8192;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: ToolExecutor,
    private readonly config: ConfigService,
  ) {}

  /**
   * Built on first use rather than at boot, so the admin panel, connection test
   * and inventory webhooks all work while the Anthropic key is still being set up.
   */
  private get anthropic(): Anthropic {
    if (!this.client) {
      const apiKey = this.config.get<string>('anthropic.apiKey');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured — the chatbot cannot reply.');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  startConversation(tenant: Tenant, channel = 'web'): Promise<Conversation> {
    return this.prisma.conversation.create({ data: { tenantId: tenant.id, channel } });
  }

  getConversation(tenantId: string, conversationId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
  }

  /**
   * Runs one customer turn to completion, yielding events as they happen.
   *
   * A hand-written agentic loop rather than the SDK tool runner, because each
   * tool result has to fan out two ways: back to the model as a tool_result, and
   * out to the widget as structured cards or a receipt.
   */
  async *streamTurn(
    tenant: Tenant,
    conversation: Conversation,
    userText: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const history = await this.loadHistory(conversation.id);
    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userText }];

    await this.persist(conversation.id, Role.user, userText);

    // The stable block carries the cache breakpoint, so the prefix it closes —
    // tool definitions plus this text — is one cache entry shared by every
    // conversation and every tenant. The tenant tail sits after it, uncached.
    // The two must not be merged: the stable prose alone is under the minimum
    // cacheable prefix, so it only caches when combined with the tools.
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: STABLE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: buildTenantContext(tenant) },
    ];

    let model = this.config.getOrThrow<string>('anthropic.model');
    let refusalRetried = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = this.anthropic.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: DIAMOND_TOOLS,
        messages,
        // Second breakpoint: auto-placed on the last cacheable block, which is
        // the newest message. That caches the conversation so far, so replaying
        // a long transcript on the next call is read at a tenth of the price.
        cache_control: { type: 'ephemeral' },
        // Low effort suits short sales turns. Thinking stays on (the default on
        // Opus 5) — disabling it risks the model writing a tool call as plain
        // text, which would silently never execute.
        output_config: { effort: 'low' },
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', delta: event.delta.text };
        }
      }

      const message = await stream.finalMessage();

      // Safety classifiers can decline a turn (HTTP 200, stop_reason "refusal").
      // Re-run once on the fallback model before giving up on the customer.
      if (message.stop_reason === 'refusal') {
        if (!refusalRetried) {
          refusalRetried = true;
          model = this.config.getOrThrow<string>('anthropic.fallbackModel');
          this.logger.warn(`Turn refused; retrying on ${model}`);
          continue;
        }
        yield {
          type: 'error',
          message: 'I am not able to help with that. Could you rephrase, or ask about our diamonds?',
        };
        return;
      }

      this.logTokenUsage(message.usage);

      messages.push({ role: 'assistant', content: message.content });
      await this.persist(conversation.id, Role.assistant, message.content, {
        usage: message.usage,
        model,
      });

      // A server-side tool paused mid-turn; re-send to let it resume.
      if (message.stop_reason === 'pause_turn') continue;

      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        yield { type: 'tool', name: toolUse.name, label: TOOL_LABELS[toolUse.name] ?? 'Working' };

        const outcome = await this.toolExecutor.execute(
          tenant,
          conversation,
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
        );

        for (const sideEvent of outcome.events) yield sideEvent;
        if (outcome.customer) await this.rememberCustomer(conversation, outcome.customer);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(outcome.result),
          is_error: outcome.isError,
        });
      }

      // All results for a turn go back in a single user message.
      messages.push({ role: 'user', content: toolResults });
      await this.persist(conversation.id, Role.user, toolResults);
    }

    yield { type: 'done' };
  }

  /**
   * Cache hits are the whole point of the breakpoints above, and they are
   * invisible in the persisted token counts — so surface them per call.
   * A cache_read of ~0 on repeated calls means something varying slipped in
   * ahead of a breakpoint.
   */
  private logTokenUsage(usage: Anthropic.Usage): void {
    const write = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    this.logger.log(
      `tokens in=${usage.input_tokens} out=${usage.output_tokens} cache_write=${write} cache_read=${read}`,
    );
  }

  // --- persistence ----------------------------------------------------------

  /** Replays stored turns in the exact wire format the model produced. */
  private async loadHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    return rows.map((row) => ({
      role: row.role,
      content: row.content as Anthropic.MessageParam['content'],
    }));
  }

  private async persist(
    conversationId: string,
    role: Role,
    content: unknown,
    call?: { usage: Anthropic.Usage; model: string },
  ): Promise<void> {
    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role,
        content: content as Prisma.InputJsonValue,
        inputTokens: call?.usage.input_tokens ?? null,
        outputTokens: call?.usage.output_tokens ?? null,
        cacheCreationInputTokens: call?.usage.cache_creation_input_tokens ?? null,
        cacheReadInputTokens: call?.usage.cache_read_input_tokens ?? null,
        model: call?.model ?? null,
      },
    });
  }

  /**
   * Keeps contact details on the conversation so later turns can reuse them.
   * First value wins — the customer should not be silently re-identified.
   */
  private async rememberCustomer(
    conversation: Conversation,
    customer: { name?: string; phone?: string; email?: string },
  ): Promise<void> {
    const data: Prisma.ConversationUpdateInput = {};
    if (customer.name && !conversation.customerName) data.customerName = customer.name;
    if (customer.phone && !conversation.customerPhone) data.customerPhone = customer.phone;
    if (customer.email && !conversation.customerEmail) data.customerEmail = customer.email;
    if (Object.keys(data).length === 0) return;

    Object.assign(conversation, data);
    await this.prisma.conversation.update({ where: { id: conversation.id }, data });
  }
}
