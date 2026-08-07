import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../catalog/redis.provider';
import { PrismaService } from '../prisma';
import { dummyPasswordHash, verifyPassword } from './password.util';
import { SessionService } from './session.service';

/** Per-email and per-IP limits, so a botnet cannot spread a targeted attack. */
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Verifies credentials and issues a session token.
   *
   * Deliberately gives one error for every failure mode — unknown email, wrong
   * password, deactivated account — so the response cannot be used to discover
   * which addresses are registered.
   */
  async login(email: string, password: string, ip: string): Promise<string> {
    const normalised = email.trim().toLowerCase();
    await this.assertNotRateLimited(normalised, ip);

    const user = await this.prisma.user.findUnique({ where: { email: normalised } });

    // Always run a verification, even with no user, so the response time does
    // not reveal whether the account exists.
    const stored = user?.passwordHash ?? (await dummyPasswordHash());
    const passwordMatches = await verifyPassword(password, stored);

    if (!user || !user.passwordHash || !user.active || !passwordMatches) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    await this.clearAttempts(normalised, ip);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.sessions.issue(user.id);
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  private async assertNotRateLimited(email: string, ip: string): Promise<void> {
    const [emailAttempts, ipAttempts] = await Promise.all([
      this.bump(`login-attempts:email:${email}`),
      this.bump(`login-attempts:ip:${ip}`),
    ]);

    if (emailAttempts > MAX_ATTEMPTS_PER_EMAIL || ipAttempts > MAX_ATTEMPTS_PER_IP) {
      throw new UnauthorizedException('Too many attempts. Try again later.');
    }
  }

  private async bump(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ATTEMPT_WINDOW_SECONDS);
    return count;
  }

  private async clearAttempts(email: string, ip: string): Promise<void> {
    await this.redis.del(`login-attempts:email:${email}`, `login-attempts:ip:${ip}`);
  }
}
