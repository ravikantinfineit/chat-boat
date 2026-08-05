/**
 * Per-tenant token bucket.
 *
 * Spec 6 asks us to stay under the dealer's search rate limit (~60 req/min) so
 * we never overload their database. We throttle on our side rather than relying
 * on their 429s, and still handle 429 as a backstop in the client.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    /** Tokens replenished per second. */
    private readonly refillRate: number,
  ) {
    this.tokens = capacity;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
    this.lastRefill = now;
  }

  /** Resolves once a token is available. */
  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.max(25, Math.ceil((deficit / this.refillRate) * 1000));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export class RateLimiterRegistry {
  private readonly buckets = new Map<string, TokenBucket>();

  /** One bucket per tenant, sized from that tenant's configured limit. */
  for(tenantId: string, perMinute: number): TokenBucket {
    const key = `${tenantId}:${perMinute}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(perMinute, perMinute / 60);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }
}
