import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../catalog/redis.provider';
import { generateKey } from '../tenant/secret.util';

/** Sliding window — a session dies this long after the last request. */
const IDLE_TTL_SECONDS = 12 * 60 * 60;
/** Hard ceiling, so a session cannot be kept alive indefinitely by activity. */
const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionRecord {
  userId: string;
  createdAt: number;
}

/**
 * Server-side sessions in Redis, addressed by an opaque token.
 *
 * Chosen over JWT because revocation has to be immediate: when a dealer removes
 * a colleague, that colleague's session must die on the next request, not when
 * a token happens to expire. A JWT would need a denylist — the same Redis
 * lookup, plus signing and clock-skew handling for nothing.
 *
 * Only the user id is stored. Roles are read fresh from the database on each
 * request, so a demotion takes effect immediately rather than at expiry.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** The token goes to the browser; only its hash is stored, so a Redis dump grants nothing. */
  async issue(userId: string): Promise<string> {
    const token = generateKey('sid');
    const record: SessionRecord = { userId, createdAt: Date.now() };

    await this.redis.set(this.key(token), JSON.stringify(record), 'EX', IDLE_TTL_SECONDS);
    // Index by user so every session can be revoked at once on password change.
    await this.redis.sadd(this.userKey(userId), this.hash(token));

    return token;
  }

  /** Returns the user id and slides the idle window, or null if the session is gone. */
  async resolve(token: string): Promise<string | null> {
    const raw = await this.redis.get(this.key(token));
    if (!raw) return null;

    const record = JSON.parse(raw) as SessionRecord;
    if (Date.now() - record.createdAt > ABSOLUTE_TTL_MS) {
      await this.revoke(token);
      return null;
    }

    await this.redis.expire(this.key(token), IDLE_TTL_SECONDS);
    return record.userId;
  }

  async revoke(token: string): Promise<void> {
    const raw = await this.redis.get(this.key(token));
    if (raw) {
      const { userId } = JSON.parse(raw) as SessionRecord;
      await this.redis.srem(this.userKey(userId), this.hash(token));
    }
    await this.redis.del(this.key(token));
  }

  /** Sign out everywhere — used on password change and when access is withdrawn. */
  async revokeAllForUser(userId: string): Promise<void> {
    const hashes = await this.redis.smembers(this.userKey(userId));
    if (hashes.length > 0) {
      await this.redis.del(...hashes.map((h) => `session:${h}`));
    }
    await this.redis.del(this.userKey(userId));
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private key(token: string): string {
    return `session:${this.hash(token)}`;
  }

  private userKey(userId: string): string {
    return `user-sessions:${userId}`;
  }
}
