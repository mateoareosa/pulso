import {
  Injectable,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';

interface RateLimitEntry {
  timestamps: number[];
  expiresAt: number;
}

export interface RateLimiterOptions {
  maxEntries?: number;
  cleanupIntervalMs?: number;
}

export const RATE_LIMITER_OPTIONS = 'RATE_LIMITER_OPTIONS';

/**
 * In-memory sliding window rate limiter designed for single-instance deployments of the Pulso MVP.
 * Uses bounded memory structures with proactive per-key eviction, periodic sweep, and strict
 * capacity limits to prevent denial-of-memory attacks.
 *
 * NOTE: This implementation is valid exclusively for a single instance of the MVP.
 * When Pulso is scaled horizontally across multiple instances in production, this service
 * must be migrated to a distributed shared store (such as Redis or Dragonfly).
 */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly attempts = new Map<string, RateLimitEntry>();
  private readonly maxEntries: number;
  private readonly cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @Optional()
    @Inject(RATE_LIMITER_OPTIONS)
    options?: RateLimiterOptions
  ) {
    this.maxEntries = options?.maxEntries ?? 10_000;
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? 60_000;

    // Periodic sweep to evict inactive expired keys
    if (cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.pruneExpired();
      }, cleanupIntervalMs);

      // Ensure timer does NOT prevent Node.js process from exiting cleanly
      if (typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Enforces a sliding window rate limit on the given key.
   * Throws HTTP 429 Too Many Requests with a generic message if limit is exceeded.
   * Does not reveal whether an account or resource exists.
   */
  public checkLimit(key: string, maxAttempts: number, windowMs: number): void {
    const now = Date.now();
    const windowStart = now - windowMs;

    const existing = this.attempts.get(key);
    const validTimestamps = existing ? existing.timestamps.filter((t) => t > windowStart) : [];

    if (validTimestamps.length >= maxAttempts) {
      // Update entry with filtered valid timestamps and extended expiry
      this.attempts.set(key, {
        timestamps: validTimestamps,
        expiresAt: now + windowMs,
      });

      throw new HttpException(
        'Demasiados intentos. Por favor, espere antes de reintentar.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // If key does not exist yet and map is at or above capacity, enforce defensive bounds
    if (!existing && this.attempts.size >= this.maxEntries) {
      this.pruneExpired(now);

      // If still at capacity after pruning expired items, evict the oldest key (FIFO)
      if (this.attempts.size >= this.maxEntries) {
        const oldestKey = this.attempts.keys().next().value;
        if (oldestKey !== undefined) {
          this.attempts.delete(oldestKey);
        }
      }
    }

    validTimestamps.push(now);
    this.attempts.set(key, {
      timestamps: validTimestamps,
      expiresAt: now + windowMs,
    });
  }

  /**
   * Scans and evicts all keys whose window has completely expired.
   * Returns the count of deleted entries.
   */
  public pruneExpired(now: number = Date.now()): number {
    let deletedCount = 0;
    for (const [key, entry] of this.attempts.entries()) {
      if (now >= entry.expiresAt) {
        this.attempts.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Resets all tracked attempts. Useful for testing isolation.
   */
  public reset(): void {
    this.attempts.clear();
  }

  /**
   * Returns current active tracked key count.
   */
  public getEntryCount(): number {
    return this.attempts.size;
  }

  public onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
