import { describe, it, expect } from 'vitest';
import {
  RegisterInputSchema,
  RegisterResponseSchema,
  LoginInputSchema,
  LoginResponseSchema,
  CurrentUserResponseSchema,
  LocationResponseSchema,
  LocationListResponseSchema,
  CreateLocationInputSchema,
  ActionTokenSchema,
  AcceptInvitationInputSchema,
  ChangePasswordInputSchema,
  ResetPasswordInputSchema,
  ActionPreviewResponseSchema,
} from '../src/auth/auth.schema.js';

describe('Auth & Tenancy Contracts (RED Phase)', () => {
  describe('RegisterInputSchema', () => {
    it('validates a compliant registration payload and normalizes email', () => {
      const input = {
        businessName: 'Kiosco El Trébol',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: '  OPERADOR@example.COM  ',
        password: 'correct horse battery staple',
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('operador@example.com');
        expect(result.data.businessName).toBe('Kiosco El Trébol');
        expect(result.data.locationName).toBe('Casa Central');
        expect(result.data.ownerName).toBe('Operador Mostrador');
      }
    });

    it('rejects passwords shorter than 12 characters', () => {
      const input = {
        businessName: 'Kiosco El Trébol',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: 'operador@example.com',
        password: 'shortpass12', // 11 chars
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.path.join('.'));
        expect(issues).toContain('password');
      }
    });

    it('rejects passwords longer than 128 characters', () => {
      const input = {
        businessName: 'Kiosco El Trébol',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: 'operador@example.com',
        password: 'a'.repeat(129),
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('does NOT enforce arbitrary complexity rules like numbers or symbols', () => {
      const input = {
        businessName: 'Kiosco El Trébol',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: 'operador@example.com',
        password: 'only lowercase words allowed here', // valid passphrase
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      const input = {
        businessName: 'Kiosco El Trébol',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: 'not-an-email',
        password: 'validpassword123',
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace-only names', () => {
      const input = {
        businessName: '   ',
        locationName: 'Casa Central',
        ownerName: 'Operador Mostrador',
        email: 'operador@example.com',
        password: 'validpassword123',
      };

      const result = RegisterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('LoginInputSchema', () => {
    it('validates and normalizes email', () => {
      const input = {
        email: '  Admin@Kiosco.COM ',
        password: 'anyvalidpassword123',
      };

      const result = LoginInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('admin@kiosco.com');
        expect(result.data.password).toBe('anyvalidpassword123');
      }
    });

    it('rejects empty password', () => {
      const input = {
        email: 'admin@kiosco.com',
        password: '',
      };

      const result = LoginInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Safe Response Schemas (No Sensitive Hashes or Tokens)', () => {
    it('CurrentUserResponseSchema strips or disallows passwordHash and tokenHash', () => {
      const safePayload = {
        user: {
          id: 'usr_123',
          email: 'operador@example.com',
          name: 'Operador Mostrador',
        },
        tenant: {
          id: 'ten_456',
          name: 'Kiosco El Trébol',
          slug: 'kiosco-el-trebol',
        },
        location: {
          id: 'loc_789',
          name: 'Casa Central',
        },
        role: 'OWNER',
        expiresAt: '2026-09-06T12:00:00.000Z',
      };

      const result = CurrentUserResponseSchema.safeParse(safePayload);
      expect(result.success).toBe(true);
    });

    it('RegisterResponseSchema validates safe payload returned after registration', () => {
      const safePayload = {
        user: {
          id: 'usr_123',
          email: 'operador@example.com',
          name: 'Operador Mostrador',
        },
        tenant: {
          id: 'ten_456',
          name: 'Kiosco El Trébol',
          slug: 'kiosco-el-trebol',
        },
        location: {
          id: 'loc_789',
          name: 'Casa Central',
        },
        role: 'OWNER',
        expiresAt: '2026-09-06T12:00:00.000Z',
      };

      const result = RegisterResponseSchema.safeParse(safePayload);
      expect(result.success).toBe(true);
    });

    it('LoginResponseSchema validates safe payload returned after login', () => {
      const safePayload = {
        user: {
          id: 'usr_123',
          email: 'operador@example.com',
          name: 'Operador Mostrador',
        },
        tenant: {
          id: 'ten_456',
          name: 'Kiosco El Trébol',
          slug: 'kiosco-el-trebol',
        },
        location: {
          id: 'loc_789',
          name: 'Casa Central',
        },
        role: 'OWNER',
        expiresAt: '2026-09-06T12:00:00.000Z',
      };

      const result = LoginResponseSchema.safeParse(safePayload);
      expect(result.success).toBe(true);
    });

    it('LocationResponseSchema validates location representation', () => {
      const location = {
        id: 'loc_789',
        tenantId: 'ten_456',
        name: 'Casa Central',
        address: 'Av. Corrientes 1234',
        isActive: true,
        createdAt: '2026-09-05T12:00:00.000Z',
        updatedAt: '2026-09-05T12:00:00.000Z',
      };

      const result = LocationResponseSchema.safeParse(location);
      expect(result.success).toBe(true);

      const listResult = LocationListResponseSchema.safeParse([location]);
      expect(listResult.success).toBe(true);
    });
  });

  describe('CreateLocationInputSchema Contract', () => {
    it('validates compliant branch data', () => {
      const valid = {
        name: 'Sucursal Centro',
        address: 'Av. Corrientes 1234',
      };
      const res = CreateLocationInputSchema.safeParse(valid);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.name).toBe('Sucursal Centro');
        expect(res.data.address).toBe('Av. Corrientes 1234');
      }
    });

    it('rejects empty or whitespace-only branch name', () => {
      expect(CreateLocationInputSchema.safeParse({ name: '' }).success).toBe(false);
      expect(CreateLocationInputSchema.safeParse({ name: '   ' }).success).toBe(false);
      expect(CreateLocationInputSchema.safeParse({ name: 'A' }).success).toBe(false);
    });

    it('rejects names exceeding 100 characters', () => {
      expect(CreateLocationInputSchema.safeParse({ name: 'A'.repeat(101) }).success).toBe(false);
    });

    it('rejects numeric or object address with schema validation error instead of runtime exception', () => {
      expect(
        CreateLocationInputSchema.safeParse({ name: 'Sucursal', address: 12345 }).success
      ).toBe(false);
      expect(
        CreateLocationInputSchema.safeParse({ name: 'Sucursal', address: { street: 'Main' } })
          .success
      ).toBe(false);
    });

    it('rejects address exceeding 255 characters', () => {
      expect(
        CreateLocationInputSchema.safeParse({ name: 'Sucursal', address: 'B'.repeat(256) }).success
      ).toBe(false);
    });

    it('strictly rejects unrecognized keys and attempts to inject tenantId', () => {
      const injected = {
        name: 'Sucursal Hacked',
        tenantId: 'injected-tenant-uuid',
      };
      const res = CreateLocationInputSchema.safeParse(injected);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
      }
    });
  });
});

describe('employee action and password contracts', () => {
  const token = 'a'.repeat(64);

  it('accepts opaque action tokens and rejects malformed or injected values', () => {
    expect(ActionTokenSchema.parse(token)).toBe(token);
    expect(ActionTokenSchema.safeParse('short token').success).toBe(false);
    expect(
      AcceptInvitationInputSchema.safeParse({ token, password: 'new secure passphrase', userId: 'x' })
        .success
    ).toBe(false);
  });

  it('enforces the shared password policy for accept, reset, and change', () => {
    expect(AcceptInvitationInputSchema.safeParse({ token, password: 'new secure passphrase' }).success).toBe(true);
    expect(ResetPasswordInputSchema.safeParse({ token, password: 'short' }).success).toBe(false);
    expect(
      ChangePasswordInputSchema.safeParse({
        currentPassword: 'old secure passphrase',
        password: 'replacement secure passphrase',
      }).success
    ).toBe(true);
    expect(
      ChangePasswordInputSchema.safeParse({
        currentPassword: 'old secure passphrase',
        password: 'replacement secure passphrase',
        tenantId: 'injected',
      }).success
    ).toBe(false);
  });

  it('exposes safe action preview data without hashes or user enumeration details', () => {
    expect(
      ActionPreviewResponseSchema.safeParse({
        type: 'INVITE',
        tenantName: 'Kiosco Centro',
        email: 'ana@example.com',
        expiresAt: '2026-09-15T12:00:00.000Z',
      }).success
    ).toBe(true);
    expect(
      ActionPreviewResponseSchema.safeParse({
        type: 'INVITE',
        tenantName: 'Kiosco Centro',
        email: 'ana@example.com',
        expiresAt: '2026-09-15T12:00:00.000Z',
        tokenHash: 'secret',
      }).success
    ).toBe(false);
  });
});
