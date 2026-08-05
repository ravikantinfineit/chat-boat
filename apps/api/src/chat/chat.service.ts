import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ChatStreamEvent } from '@diamond/shared';
import { ChatMessage, Conversation, Tenant } from '../database/entities';
import { buildSystemPrompt } from './system-prompt';
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
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
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

  async startConversation(tenant: Tenant, channel = 'web'): Promise<Conversation> {
    return this.conversations.save(
      this.conversations.create({ tenant_id: tenant.id, channel }),
    );
  }

  async getConversation(tenantId: string, conversationId: string): Promise<Conversation | null> {
    return this.conversations.findOne({ where: { id: conversationId, tenant_id: tenantId } });
  }

  /**
   * Runs one customer turn to completion, yielding events as they happen.
   *
   * This is a hand-written agentic loop rather than the SDK tool runner because
   * each tool result has to fan out two ways: back to the model as a
   * tool_result, and out to the widget as structured cards or a receipt.
   */
  async *streamTurn(
    tenant: Tenant,
    conversation: Conversation,
    userText: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const history = await this.loadHistory(conversation.id);
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    await this.persist(conversation.id, 'user', userText);

    const system = buildSystemPrompt(tenant);
    let model = this.config.getOrThrow<string>('anthropic.model');
    let refusalRetried = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = this.anthropic.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: DIAMOND_TOOLS,
        messages,
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

      messages.push({ role: 'assistant', content: message.content });
      await this.persist(
        conversation.id,
        'assistant',
        message.content,
        message.usage.input_tokens,
        message.usage.output_tokens,
      );

      // A server-side tool paused mid-turn; re-send to let it resume.
      if (message.stop_reason === 'pause_turn') continue;

      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        yield {
          type: 'tool',
          name: toolUse.name,
          label: TOOL_LABELS[toolUse.name] ?? 'Working',
        };

        const outcome = await this.toolExecutor.execute(
          tenant,
          conversation,
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, any>,
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
      const toolResultMessage: Anthropic.MessageParam = { role: 'user', content: toolResults };
      messages.push(toolResultMessage);
      await this.persist(conversation.id, 'user', toolResults);
    }

    yield { type: 'done' };
  }

  // --- persistence ----------------------------------------------------------

  /** Replays stored turns in the exact wire format the model produced. */
  private async loadHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.messages.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
    });
    return rows.map((row) => ({
      role: row.role,
      content: row.content as Anthropic.MessageParam['content'],
    }));
  }

  private async persist(
    conversationId: string,
    role: 'user' | 'assistant',
    content: unknown,
    inputTokens?: number,
    outputTokens?: number,
  ): Promise<void> {
    await this.messages.save(
      this.messages.create({
        conversation_id: conversationId,
        role,
        content,
        input_tokens: inputTokens ?? null,
        output_tokens: outputTokens ?? null,
      }),
    );
  }

  /** Keeps contact details on the conversation so later turns can reuse them. */
  private async rememberCustomer(
    conversation: Conversation,
    customer: { name?: string; phone?: string; email?: string },
  ): Promise<void> {
    // Only the scalar columns — including the relation would not satisfy
    // TypeORM's update() typing.
    const patch: {
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
    } = {};
    if (customer.name && !conversation.customer_name) patch.customer_name = customer.name;
    if (customer.phone && !conversation.customer_phone) patch.customer_phone = customer.phone;
    if (customer.email && !conversation.customer_email) patch.customer_email = customer.email;
    if (Object.keys(patch).length === 0) return;

    Object.assign(conversation, patch);
    await this.conversations.update({ id: conversation.id }, patch);
  }
}
