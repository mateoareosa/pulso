import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  normalizeEmail,
  generateActionToken,
  hashActionToken,
} from '../src/auth/security.utils.js';
import { isCookieSecure } from '../src/auth/cookie.utils.js';

describe('Security Utilities (RED Phase)', () => {
  describe('normalizeEmail', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeEmail('   USER@Example.COM   ')).toBe('user@example.com');
      expect(normalizeEmail('Admin@pulso.app')).toBe('admin@pulso.app');
    });
  });

  describe('Password Hashing with Argon2id', () => {
    it('generates a valid Argon2id hash and verifies matching password', async () => {
      const rawPassword = 'correct horse battery staple';
      const hash = await hashPassword(rawPassword);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      // Argon2 format starts with $argon2id$
      expect(hash.startsWith('$argon2id$')).toBe(true);

      const isValid = await verifyPassword(hash, rawPassword);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password verification', async () => {
      const rawPassword = 'correct horse battery staple';
      const hash = await hashPassword(rawPassword);

      const isValid = await verifyPassword(hash, 'wrong password attempt');
      expect(isValid).toBe(false);
    });
  });

  describe('Session Token Generation and SHA-256 Hashing', () => {
    it('generates a cryptographically random token with at least 256 bits of entropy', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      // 32 bytes hex is 64 chars = 256 bits
      expect(token1.length).toBeGreaterThanOrEqual(64);
    });

    it('computes deterministic SHA-256 hex hash from raw token', () => {
      const token = generateSessionToken();
      const hash1 = hashSessionToken(token);
      const hash2 = hashSessionToken(token);

      expect(hash1).toBe(hash2);
      // SHA-256 hex digest is exactly 64 characters
      expect(hash1.length).toBe(64);
      expect(hash1).not.toBe(token);
    });
  });

  describe('isCookieSecure Inviolability', () => {
    it('always returns true in production even when COOKIE_SECURE=false', () => {
      expect(isCookieSecure('production', 'false')).toBe(true);
      expect(isCookieSecure('production', 'true')).toBe(true);
      expect(isCookieSecure('production', undefined)).toBe(true);
    });

    it('returns false in development when COOKIE_SECURE=false', () => {
      expect(isCookieSecure('development', 'false')).toBe(false);
      expect(isCookieSecure('development', undefined)).toBe(false);
    });

    it('returns true in development when COOKIE_SECURE=true', () => {
      expect(isCookieSecure('development', 'true')).toBe(true);
    });

    it('returns false in test when COOKIE_SECURE=false and true when COOKIE_SECURE=true', () => {
      expect(isCookieSecure('test', 'false')).toBe(false);
      expect(isCookieSecure('test', 'true')).toBe(true);
    });
  });

  describe('Employee action tokens', () => {
    it('generates distinct 256-bit URL-safe opaque tokens', () => {
      const first = generateActionToken();
      const second = generateActionToken();
      expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(second).not.toBe(first);
    });

    it('hashes action tokens deterministically without retaining the raw secret', () => {
      const token = 'A'.repeat(43);
      expect(hashActionToken(token)).toBe(hashActionToken(token));
      expect(hashActionToken(token)).toMatch(/^[a-f0-9]{64}$/);
      expect(hashActionToken(token)).not.toBe(token);
    });
  });
});
