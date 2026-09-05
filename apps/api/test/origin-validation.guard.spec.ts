import { describe, it, expect } from 'vitest';
import { OriginValidationGuard } from '../src/auth/origin-validation.guard.js';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.utils.js';

function createMockContext(
  method: string,
  headers: Record<string, string | undefined> = {},
  cookies: Record<string, string | undefined> = {}
): ExecutionContext {
  const req = {
    method,
    headers,
    cookies,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('OriginValidationGuard', () => {
  const allowedProdOrigins = ['https://app.pulso.com', 'https://pos.pulso.com'];

  describe('Production Environment', () => {
    const prodGuard = new OriginValidationGuard({
      isProduction: true,
      allowedOrigins: allowedProdOrigins,
    });

    it('allows read-only GET requests regardless of origin headers', () => {
      const context = createMockContext('GET', { origin: 'https://evil.com' });
      expect(prodGuard.canActivate(context)).toBe(true);
    });

    it('allows mutating request with an explicit allowed Origin header', () => {
      const context = createMockContext('POST', { origin: 'https://app.pulso.com' });
      expect(prodGuard.canActivate(context)).toBe(true);
    });

    it('rejects mutating request with an unauthorized Origin header with 403', () => {
      const context = createMockContext('POST', { origin: 'https://malicious.com' });
      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('prioritizes Origin over Referer: rejects when Origin is invalid even if Referer is valid', () => {
      const context = createMockContext('POST', {
        origin: 'https://attacker.com',
        referer: 'https://app.pulso.com/sales',
      });
      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('falls back to Referer when Origin is absent and allows if Referer origin is permitted', () => {
      const context = createMockContext('POST', {
        referer: 'https://app.pulso.com/dashboard/settings',
      });
      expect(prodGuard.canActivate(context)).toBe(true);
    });

    it('falls back to Referer when Origin is absent and rejects if Referer origin is not permitted', () => {
      const context = createMockContext('POST', {
        referer: 'https://phishing.com/attack',
      });
      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects malformed Referer headers with 403', () => {
      const context = createMockContext('POST', {
        referer: 'not-a-valid-url',
      });
      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects authenticated mutations when both Origin and Referer are absent in production', () => {
      const context = createMockContext('POST', {}, { [SESSION_COOKIE_NAME]: 'active-token-123' });
      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows unauthenticated mutations without origin evidence (e.g. initial login/register from CLI)', () => {
      const context = createMockContext('POST', {}, {});
      expect(prodGuard.canActivate(context)).toBe(true);
    });
  });

  describe('Development & Testing Environment', () => {
    const devGuard = new OriginValidationGuard({
      isProduction: false,
      allowedOrigins: ['http://localhost:3000'],
    });

    it('allows localhost and local loopback origins in dev/test', () => {
      expect(
        devGuard.canActivate(createMockContext('POST', { origin: 'http://localhost:3000' }))
      ).toBe(true);
      expect(
        devGuard.canActivate(createMockContext('POST', { origin: 'http://127.0.0.1:4100' }))
      ).toBe(true);
      expect(
        devGuard.canActivate(createMockContext('POST', { origin: 'http://localhost:4173' }))
      ).toBe(true);
    });

    it('allows authenticated mutations without origin in dev/test to facilitate testing/tooling', () => {
      const context = createMockContext('POST', {}, { [SESSION_COOKIE_NAME]: 'test-token' });
      expect(devGuard.canActivate(context)).toBe(true);
    });

    it('still rejects explicitly unauthorized foreign origins in dev/test', () => {
      const context = createMockContext('POST', { origin: 'https://evil-foreign-domain.com' });
      expect(() => devGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
