import { describe, expect, it } from 'vitest';
import {
  CreateEmployeeInvitationInputSchema,
  EmployeeMutationInputSchema,
  EmployeeResponseSchema,
  ManualActionLinkResponseSchema,
} from '../src/employees/employees.schema.js';

describe('employee management contracts', () => {
  it('normalizes a tenant-safe invitation and rejects injected scope', () => {
    const valid = CreateEmployeeInvitationInputSchema.parse({
      email: '  CASHIER@Example.COM ',
      name: 'Ana',
      role: 'CASHIER',
      locationIds: ['loc_a'],
    });

    expect(valid).toEqual({
      email: 'cashier@example.com',
      name: 'Ana',
      role: 'CASHIER',
      locationIds: ['loc_a'],
    });
    expect(
      CreateEmployeeInvitationInputSchema.safeParse({
        ...valid,
        tenantId: 'foreign-tenant',
      }).success
    ).toBe(false);
  });

  it('requires optimistic versioning and explicit assignments for non-owners', () => {
    expect(
      EmployeeMutationInputSchema.parse({
        version: 4,
        role: 'MANAGER',
        status: 'ACTIVE',
        locationIds: ['loc_b', 'loc_a'],
      })
    ).toEqual({
      version: 4,
      role: 'MANAGER',
      status: 'ACTIVE',
      locationIds: ['loc_b', 'loc_a'],
    });
    expect(
      EmployeeMutationInputSchema.safeParse({
        version: 4,
        role: 'CASHIER',
        status: 'ACTIVE',
        locationIds: [],
      }).success
    ).toBe(false);
    expect(
      EmployeeMutationInputSchema.safeParse({
        version: 4,
        role: 'CASHIER',
        status: 'ACTIVE',
        locationIds: ['loc_a', 'loc_a'],
      }).success
    ).toBe(false);
  });

  it('accepts owners without assignments and rejects invited mutation status', () => {
    expect(
      EmployeeMutationInputSchema.safeParse({
        version: 1,
        role: 'OWNER',
        status: 'ACTIVE',
        locationIds: [],
      }).success
    ).toBe(true);
    expect(
      EmployeeMutationInputSchema.safeParse({
        version: 1,
        role: 'OWNER',
        status: 'INVITED',
        locationIds: [],
      }).success
    ).toBe(false);
  });

  it('keeps employee responses and manual links free of secret hashes', () => {
    const employee = EmployeeResponseSchema.parse({
      id: 'mem_1',
      userId: 'usr_1',
      email: 'ana@example.com',
      name: 'Ana',
      role: 'CASHIER',
      status: 'ACTIVE',
      version: 2,
      locationIds: ['loc_1'],
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z',
    });
    expect(employee).not.toHaveProperty('passwordHash');
    expect(employee).not.toHaveProperty('tokenHash');

    expect(
      ManualActionLinkResponseSchema.safeParse({
        url: 'https://app.pulso.test/auth/action/opaque-token',
        expiresAt: '2026-09-15T12:00:00.000Z',
      }).success
    ).toBe(true);
    expect(
      ManualActionLinkResponseSchema.safeParse({
        url: 'javascript:alert(1)',
        expiresAt: '2026-09-15T12:00:00.000Z',
      }).success
    ).toBe(false);
  });
});
