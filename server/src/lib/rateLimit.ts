/**
 * Small fixed-window rate limiter. Intended for single-instance deployments
 * (including the default Docker setup). For multi-instance production use a
 * shared store such as Redis.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    const timer = setInterval(() => this.cleanup(), Math.max(windowMs, 60_000));
    timer.unref?.();
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
    }
    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
