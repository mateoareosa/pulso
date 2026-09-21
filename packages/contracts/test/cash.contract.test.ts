import { describe, it, expect } from 'vitest';
import {
  OpenCashShiftCommandSchema,
  CloseCashShiftCommandSchema,
  CreateCashMovementCommandSchema,
  QueryCashShiftsSchema,
} from '../src/cash/cash.schema.js';

describe('Cash Contracts Validation', () => {
  describe('OpenCashShiftCommandSchema', () => {
    it('accepts valid opening command with 0 or positive amount', () => {
      const validZero = {
        openingAmountCents: 0,
        idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      };
      expect(OpenCashShiftCommandSchema.safeParse(validZero).success).toBe(true);

      const validPositive = {
        openingAmountCents: 1500000,
        idempotencyKey: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      };
      expect(OpenCashShiftCommandSchema.safeParse(validPositive).success).toBe(true);
    });

    it('rejects negative opening amount', () => {
      const invalid = {
        openingAmountCents: -100,
        idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      };
      const res = OpenCashShiftCommandSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects non-integer opening amount', () => {
      const invalid = {
        openingAmountCents: 1500.5,
        idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      };
      const res = OpenCashShiftCommandSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects invalid idempotencyKey format', () => {
      const invalid = {
        openingAmountCents: 5000,
        idempotencyKey: 'not-a-uuid',
      };
      const res = OpenCashShiftCommandSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('strictly rejects injected tenantId or locationId', () => {
      const injected = {
        openingAmountCents: 5000,
        idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        tenantId: 'injected-tenant',
      };
      const res = OpenCashShiftCommandSchema.safeParse(injected);
      expect(res.success).toBe(false);
    });
  });

  describe('CloseCashShiftCommandSchema', () => {
    it('accepts valid counted amount >= 0', () => {
      const valid = {
        countedAmountCents: 2350000,
        idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      };
      expect(CloseCashShiftCommandSchema.safeParse(valid).success).toBe(true);
    });

    it('acepta y normaliza un motivo de diferencia significativo', () => {
      const result = CloseCashShiftCommandSchema.safeParse({
        countedAmountCents: 2350000,
        motivo: '  Error al entregar cambio  ',
        idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.motivo).toBe('Error al entregar cambio');
    });

    it('rechaza un motivo vacío, demasiado corto o demasiado largo cuando se informa', () => {
      const base = {
        countedAmountCents: 2350000,
        idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      };

      expect(CloseCashShiftCommandSchema.safeParse({ ...base, motivo: '  ' }).success).toBe(false);
      expect(CloseCashShiftCommandSchema.safeParse({ ...base, motivo: 'ab' }).success).toBe(false);
      expect(
        CloseCashShiftCommandSchema.safeParse({ ...base, motivo: 'a'.repeat(256) }).success
      ).toBe(false);
    });

    it('rejects negative counted amount', () => {
      const invalid = {
        countedAmountCents: -50,
        idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      };
      expect(CloseCashShiftCommandSchema.safeParse(invalid).success).toBe(false);
    });

    it('strictly rejects unknown properties', () => {
      const injected = {
        countedAmountCents: 1000,
        idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        status: 'CLOSED',
      };
      expect(CloseCashShiftCommandSchema.safeParse(injected).success).toBe(false);
    });
  });

  describe('CreateCashMovementCommandSchema', () => {
    it('accepts valid cash-in or cash-out payload with significant reason', () => {
      const valid = {
        amountCents: 50000,
        reason: 'Pago a repartidor de hielo',
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects zero or negative movement amount', () => {
      const zero = {
        amountCents: 0,
        reason: 'Motivo valido',
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(zero).success).toBe(false);

      const negative = {
        amountCents: -5000,
        reason: 'Motivo valido',
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(negative).success).toBe(false);
    });

    it('rejects empty, blank, or too short reason', () => {
      const emptyReason = {
        amountCents: 1000,
        reason: '  ',
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(emptyReason).success).toBe(false);

      const shortReason = {
        amountCents: 1000,
        reason: 'ab',
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(shortReason).success).toBe(false);
    });

    it('rejects excessively long reason (> 255 chars)', () => {
      const longReason = {
        amountCents: 1000,
        reason: 'a'.repeat(256),
        idempotencyKey: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      };
      expect(CreateCashMovementCommandSchema.safeParse(longReason).success).toBe(false);
    });
  });

  describe('QueryCashShiftsSchema', () => {
    it('applies defaults for page and limit', () => {
      const res = QueryCashShiftsSchema.safeParse({});
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.page).toBe(1);
        expect(res.data.limit).toBe(20);
      }
    });

    it('coerces string parameters to integers', () => {
      const res = QueryCashShiftsSchema.safeParse({ page: '2', limit: '50' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.page).toBe(2);
        expect(res.data.limit).toBe(50);
      }
    });

    it('rejects limit > 100 or non-positive integers', () => {
      expect(QueryCashShiftsSchema.safeParse({ limit: 101 }).success).toBe(false);
      expect(QueryCashShiftsSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(QueryCashShiftsSchema.safeParse({ page: -1 }).success).toBe(false);
    });

    it('validates date range with parseSalesDateRange', () => {
      expect(
        QueryCashShiftsSchema.safeParse({ from: '2026-05-01', to: '2026-05-31' }).success
      ).toBe(true);
      expect(QueryCashShiftsSchema.safeParse({ from: '2026-02-31' }).success).toBe(false);
      expect(
        QueryCashShiftsSchema.safeParse({ from: '2026-05-31', to: '2026-05-01' }).success
      ).toBe(false);
    });
  });
});
