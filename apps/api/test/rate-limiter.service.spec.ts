import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RateLimiterService (Bounded Sliding Window & TTL Eviction)', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    vi.useFakeTimers();
    // Use cleanupIntervalMs: 0 for synchronous controlled testing
    rateLimiter = new RateLimiterService({ maxEntries: 10, cleanupIntervalMs: 0 });
  });

  afterEach(() => {
    rateLimiter.onModuleDestroy();
    vi.useRealTimers();
  });

  it('allows requests within threshold', () => {
    expect(() => {
      rateLimiter.checkLimit('ip:1.2.3.4', 3, 60_000);
      rateLimiter.checkLimit('ip:1.2.3.4', 3, 60_000);
      rateLimiter.checkLimit('ip:1.2.3.4', 3, 60_000);
    }).not.toThrow();

    expect(rateLimiter.getEntryCount()).toBe(1);
  });

  it('blocks requests exceeding threshold inside window with generic HTTP 429', () => {
    rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);
    rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);

    try {
      rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);
      expect.fail('Expected HttpException 429 to be thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(httpErr.message).toContain('Demasiados intentos');
    }
  });

  it('unblocks requests after window expires', () => {
    rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);
    rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);

    // Blocked inside window
    expect(() => rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000)).toThrow();

    // Advance past window (61 seconds)
    vi.advanceTimersByTime(61_000);

    // Unblocked after window expiration
    expect(() => {
      rateLimiter.checkLimit('ip:1.2.3.4', 2, 60_000);
    }).not.toThrow();
  });

  it('effectively evicts expired keys from internal memory', () => {
    rateLimiter.checkLimit('key-1', 5, 30_000);
    rateLimiter.checkLimit('key-2', 5, 30_000);
    expect(rateLimiter.getEntryCount()).toBe(2);

    // Advance 31 seconds -> both entries expire
    vi.advanceTimersByTime(31_000);

    const deletedCount = rateLimiter.pruneExpired();
    expect(deletedCount).toBe(2);
    expect(rateLimiter.getEntryCount()).toBe(0);
  });

  it('strictly bounds memory growth and never exceeds maxEntries under high-cardinality attacks', () => {
    // Small bounded limiter of max 5 entries
    const boundedLimiter = new RateLimiterService({ maxEntries: 5, cleanupIntervalMs: 0 });

    // Flood with 15 distinct keys within the same time window
    for (let i = 1; i <= 15; i++) {
      boundedLimiter.checkLimit(`attacker-ip-${i}`, 5, 60_000);
      // Entry count must NEVER exceed 5
      expect(boundedLimiter.getEntryCount()).toBeLessThanOrEqual(5);
    }

    expect(boundedLimiter.getEntryCount()).toBe(5);

    // Advance time to expire older entries
    vi.advanceTimersByTime(61_000);

    // New keys cause expired ones to be pruned automatically
    boundedLimiter.checkLimit('new-attacker-ip-1', 5, 60_000);
    expect(boundedLimiter.getEntryCount()).toBe(1);

    boundedLimiter.onModuleDestroy();
  });
});
