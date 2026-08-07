import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/**
 * Per million tokens, in USD.
 *
 * Configuration, not truth: the Anthropic invoice is authoritative and these
 * drift when pricing changes. Everything derived from them is labelled
 * "estimated" in the UI for that reason.
 */
const RATES = {
  input: 3,
  output: 15,
  /** Writing to cache costs about 25% more than an ordinary input token. */
  cacheWrite: 3.75,
  /** Reading from it costs a tenth. This is where the saving comes from. */
  cacheRead: 0.3,
};

export interface UsageSummary {
  conversations: number;
  visitors: number;
  messages: number;
  tokens: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
    total: number;
  };
  /** Share of prompt tokens served from cache. The architecture's health check. */
  cacheHitRate: number;
  estimatedCostUsd: number;
  funnel: { tool: string; calls: number; failures: number }[];
  daily: { date: string; messages: number; tokens: number; costUsd: number }[];
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async summarise(tenantId: string, days: number): Promise<UsageSummary> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const window = { tenantId, createdAt: { gte: since } };

    const [conversations, visitorRows, messages, totals, toolCalls, daily] = await Promise.all([
      this.prisma.conversation.count({ where: window }),
      // Anonymous visitor ids, deduplicated. Conversations without one predate
      // the widget sending it and are simply not counted rather than guessed at.
      this.prisma.conversation.findMany({
        where: { ...window, visitorId: { not: null } },
        distinct: ['visitorId'],
        select: { visitorId: true },
      }),
      this.prisma.chatMessage.count({ where: window }),
      this.prisma.chatMessage.aggregate({
        where: window,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      }),
      this.prisma.toolCallEvent.groupBy({
        by: ['tool', 'ok'],
        where: window,
        _count: { _all: true },
      }),
      this.dailyBreakdown(tenantId, since),
    ]);

    const tokens = {
      input: totals._sum.inputTokens ?? 0,
      output: totals._sum.outputTokens ?? 0,
      cacheWrite: totals._sum.cacheCreationInputTokens ?? 0,
      cacheRead: totals._sum.cacheReadInputTokens ?? 0,
      total: 0,
    };
    tokens.total = tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead;

    const promptTokens = tokens.input + tokens.cacheWrite + tokens.cacheRead;

    // Collapse the (tool, ok) pairs into one row per tool.
    const funnel = new Map<string, { tool: string; calls: number; failures: number }>();
    for (const row of toolCalls) {
      const entry = funnel.get(row.tool) ?? { tool: row.tool, calls: 0, failures: 0 };
      entry.calls += row._count._all;
      if (!row.ok) entry.failures += row._count._all;
      funnel.set(row.tool, entry);
    }

    return {
      conversations,
      visitors: visitorRows.length,
      messages,
      tokens,
      cacheHitRate: promptTokens === 0 ? 0 : tokens.cacheRead / promptTokens,
      estimatedCostUsd: estimateCost(tokens),
      funnel: [...funnel.values()].sort((a, b) => b.calls - a.calls),
      daily,
    };
  }

  /**
   * Raw SQL for the day buckets: Prisma's groupBy cannot group by an expression,
   * and pulling every message into memory to bucket it in JS would be the one
   * query on this page that does not scale.
   */
  private async dailyBreakdown(tenantId: string, since: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        date: Date;
        messages: bigint;
        input: bigint | null;
        output: bigint | null;
        cache_write: bigint | null;
        cache_read: bigint | null;
      }[]
    >`
      SELECT date_trunc('day', created_at) AS date,
             count(*) AS messages,
             sum(input_tokens) AS input,
             sum(output_tokens) AS output,
             sum(cache_creation_input_tokens) AS cache_write,
             sum(cache_read_input_tokens) AS cache_read
      FROM chat_messages
      WHERE tenant_id = ${tenantId}::uuid AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => {
      const tokens = {
        input: Number(row.input ?? 0),
        output: Number(row.output ?? 0),
        cacheWrite: Number(row.cache_write ?? 0),
        cacheRead: Number(row.cache_read ?? 0),
      };
      return {
        date: row.date.toISOString().slice(0, 10),
        messages: Number(row.messages),
        tokens: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
        costUsd: estimateCost(tokens),
      };
    });
  }
}

function estimateCost(tokens: {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}): number {
  const cost =
    (tokens.input * RATES.input +
      tokens.output * RATES.output +
      tokens.cacheWrite * RATES.cacheWrite +
      tokens.cacheRead * RATES.cacheRead) /
    1_000_000;
  return Math.round(cost * 10000) / 10000;
}
