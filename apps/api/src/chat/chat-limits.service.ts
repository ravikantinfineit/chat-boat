import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../catalog/redis.provider';
import { PrismaService, type Tenant } from '../prisma';

/** Why a message was refused. The widget renders the reason in the chat. */
export class ChatLimitError extends Error {
  constructor(readonly reason: 'rate' | 'daily_cap' | 'monthly_budget' | 'origin', message: string) {
    super(message);
  }
}

/**
 * Burst limits. One customer typing quickly must not trip these; a script
 * hammering the endpoint must.
 */
const PER_CONVERSATION_PER_MINUTE = 12;
const PER_IP_PER_MINUTE = 30;
const PER_TENANT_PER_MINUTE = 120;
const WINDOW_SECONDS = 60;

/**
 * What stands between a public widget key and an unbounded Anthropic bill.
 *
 * One `/chat/message` call can run eight tool iterations of 8,192 tokens. The
 * key that authorises it ships in the page source of the dealer's website, so
 * "nobody would do that" is not a control.
 */
@Injectable()
export class ChatLimitsService {
  private readonly logger = new Logger(ChatLimitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Checked before the model is called, in cost order: the free checks first,
   * the ones that touch Postgres only if those pass.
   */
  async assertAllowed(tenant: Tenant, conversationId: string, ip: string, origin?: string): Promise<void> {
    this.assertOriginAllowed(tenant, origin);
    await this.assertNotBursting(tenant, conversationId, ip);
    await this.assertWithinBudget(tenant);
  }

  /**
   * The widget key is public by design, so it identifies the showroom but proves
   * nothing about who is calling. The allowlist is what stops someone embedding
   * a dealer's assistant on their own site and spending the dealer's budget.
   *
   * Empty means unrestricted — a showroom that has not configured this is no
   * worse off than before, and switching it on is a deliberate act.
   */
  private assertOriginAllowed(tenant: Tenant, origin?: string): void {
    if (tenant.allowedOrigins.length === 0) return;
    // A missing Origin header is a non-browser caller: curl, a server, a bot.
    // Once a showroom has named its sites, that is exactly what to refuse.
    if (!origin || !tenant.allowedOrigins.includes(origin)) {
      throw new ChatLimitError(
        'origin',
        'This assistant is not available on this website. Please contact the showroom directly.',
      );
    }
  }

  private async assertNotBursting(tenant: Tenant, conversationId: string, ip: string): Promise<void> {
    const [perConversation, perIp, perTenant] = await Promise.all([
      this.bump(`chat-rate:conv:${conversationId}`),
      this.bump(`chat-rate:ip:${tenant.id}:${ip}`),
      this.bump(`chat-rate:tenant:${tenant.id}`),
    ]);

    if (
      perConversation > PER_CONVERSATION_PER_MINUTE ||
      perIp > PER_IP_PER_MINUTE ||
      perTenant > PER_TENANT_PER_MINUTE
    ) {
      this.logger.warn(
        `Rate limited ${tenant.name}: conv=${perConversation} ip=${perIp} tenant=${perTenant}`,
      );
      throw new ChatLimitError('rate', 'You are sending messages very quickly. Please wait a moment.');
    }
  }

  /**
   * The dealer's own ceilings, counted from the same rows the usage dashboard
   * reports — so the number that stops the bot is the number the dealer sees.
   */
  private async assertWithinBudget(tenant: Tenant): Promise<void> {
    if (tenant.dailyMessageCap === null && tenant.monthlyTokenBudget === null) return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (tenant.dailyMessageCap !== null) {
      const today = await this.prisma.chatMessage.count({
        where: { tenantId: tenant.id, role: 'user', createdAt: { gte: startOfDay } },
      });
      if (today >= tenant.dailyMessageCap) {
        throw new ChatLimitError(
          'daily_cap',
          'The assistant has reached its limit for today. Please contact the showroom directly.',
        );
      }
    }

    if (tenant.monthlyTokenBudget !== null) {
      const usage = await this.prisma.chatMessage.aggregate({
        where: { tenantId: tenant.id, createdAt: { gte: startOfMonth } },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      });
      const total =
        (usage._sum.inputTokens ?? 0) +
        (usage._sum.outputTokens ?? 0) +
        (usage._sum.cacheCreationInputTokens ?? 0) +
        (usage._sum.cacheReadInputTokens ?? 0);

      if (total >= tenant.monthlyTokenBudget) {
        throw new ChatLimitError(
          'monthly_budget',
          'The assistant has reached its limit for this month. Please contact the showroom directly.',
        );
      }
    }
  }

  private async bump(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
    return count;
  }
}
