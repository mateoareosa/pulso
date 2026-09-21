import { describe, it, expect } from 'vitest';
import {
  CreateSaleCommandSchema,
  ReturnSaleCommandSchema,
  VoidSaleCommandSchema,
  TenderTypeSchema,
  SyncBatchSchema,
  parseSalesDateRange,
  QuerySalesSchema,
} from '../src/sales/sales.schema.js';

describe('Sales Contract Validation', () => {
  describe('sale adjustment commands', () => {
    it('accepts a partial return with a mandatory reason and idempotency key', () => {
      const result = ReturnSaleCommandSchema.parse({
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reason: 'Producto dañado',
        items: [{ saleItemId: 'item-1', quantity: 1 }],
        refundTender: 'CASH',
      });

      expect(result.reason).toBe('Producto dañado');
      expect(result.items).toEqual([{ saleItemId: 'item-1', quantity: 1 }]);
    });

    it('accepts non-cash refund tenders for pending manual settlement', () => {
      const result = ReturnSaleCommandSchema.parse({
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reason: 'Reintegro a tarjeta',
        items: [{ saleItemId: 'item-1', quantity: 1 }],
        refundTender: 'DEBIT',
      });

      expect(result.refundTender).toBe('DEBIT');
    });

    it('rejects blank reasons and duplicate lines', () => {
      expect(() =>
        ReturnSaleCommandSchema.parse({
          idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          reason: '   ',
          items: [
            { saleItemId: 'item-1', quantity: 1 },
            { saleItemId: 'item-1', quantity: 1 },
          ],
          refundTender: 'CASH',
        })
      ).toThrow();
    });

    it('accepts a full-sale void and rejects client-supplied line items', () => {
      expect(
        VoidSaleCommandSchema.parse({
          idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          reason: 'Venta duplicada',
        })
      ).toEqual({
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reason: 'Venta duplicada',
      });

      expect(() =>
        VoidSaleCommandSchema.parse({
          idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          reason: 'Venta duplicada',
          items: [{ saleItemId: 'item-1', quantity: 1 }],
        })
      ).toThrow();
    });
  });
  it('should validate a compliant CreateSaleCommand DTO without tenantId or locationId', () => {
    const validPayload = {
      shiftId: 'shift-789',
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      items: [
        {
          productId: 'prod-001',
          name: 'Alfajor Triple',
          barcode: '7791234567890',
          quantity: 2,
          unitPriceCents: 150000,
          totalPriceCents: 300000,
        },
      ],
      tenders: [
        {
          type: 'CASH',
          amountCents: 300000,
          receivedAmountCents: 350000,
          changeAmountCents: 50000,
        },
      ],
      totalCents: 300000,
      createdAtUtc: new Date().toISOString(),
    };

    const parsed = CreateSaleCommandSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('should strictly reject client payloads attempting to inject tenantId or locationId', () => {
    const injectedPayload = {
      tenantId: 'hacked-tenant',
      locationId: 'hacked-location',
      shiftId: 'shift-789',
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      items: [
        {
          productId: 'prod-001',
          name: 'Alfajor Triple',
          quantity: 1,
          unitPriceCents: 150000,
          totalPriceCents: 150000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 150000 }],
      totalCents: 150000,
      createdAtUtc: new Date().toISOString(),
    };

    const parsed = CreateSaleCommandSchema.safeParse(injectedPayload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errorKeys = parsed.error.issues.map((i) => i.code);
      expect(errorKeys).toContain('unrecognized_keys');
    }
  });

  it('should reject non-integer cents in contracts', () => {
    const invalidPayload = {
      shiftId: 'shift-789',
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      items: [
        {
          productId: 'prod-001',
          name: 'Caramelos',
          quantity: 1,
          unitPriceCents: 150.5, // invalid float!
          totalPriceCents: 150.5,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 150.5 }],
      totalCents: 150.5,
      createdAtUtc: new Date().toISOString(),
    };

    const parsed = CreateSaleCommandSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it('should only accept allowed tender types without payment processor links', () => {
    expect(TenderTypeSchema.safeParse('CASH').success).toBe(true);
    expect(TenderTypeSchema.safeParse('DEBIT').success).toBe(true);
    expect(TenderTypeSchema.safeParse('CREDIT').success).toBe(true);
    expect(TenderTypeSchema.safeParse('TRANSFER').success).toBe(true);
    expect(TenderTypeSchema.safeParse('OTHER').success).toBe(true);
    expect(TenderTypeSchema.safeParse('STRIPE_CHECKOUT').success).toBe(false);
    expect(TenderTypeSchema.safeParse('MERCADOPAGO_LINK').success).toBe(false);
  });

  describe('SyncBatch Contract Strict Validation', () => {
    const validSalePayload = {
      shiftId: 'shift-789',
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      items: [
        {
          productId: 'prod-001',
          name: 'Alfajor Triple',
          quantity: 2,
          unitPriceCents: 150000,
          totalPriceCents: 300000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 300000 }],
      totalCents: 300000,
      createdAtUtc: new Date().toISOString(),
    };

    it('should validate a compliant SyncBatch payload', () => {
      const validBatch = {
        deviceId: 'device-pos-01',
        operations: [
          {
            operationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            type: 'CREATE_SALE',
            payload: validSalePayload,
          },
        ],
      };

      const parsed = SyncBatchSchema.safeParse(validBatch);
      expect(parsed.success).toBe(true);
    });

    it('should reject injection at root of SyncBatch', () => {
      const injectedRoot = {
        deviceId: 'device-pos-01',
        tenantId: 'injected-tenant',
        operations: [
          {
            operationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            type: 'CREATE_SALE',
            payload: validSalePayload,
          },
        ],
      };

      const parsed = SyncBatchSchema.safeParse(injectedRoot);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
      }
    });

    it('should reject injection inside a SyncBatch operation', () => {
      const injectedOp = {
        deviceId: 'device-pos-01',
        operations: [
          {
            operationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            type: 'CREATE_SALE',
            locationId: 'injected-location',
            payload: validSalePayload,
          },
        ],
      };

      const parsed = SyncBatchSchema.safeParse(injectedOp);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
      }
    });

    it('should reject injection inside the sale payload within a SyncBatch', () => {
      const injectedPayload = {
        deviceId: 'device-pos-01',
        operations: [
          {
            operationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            type: 'CREATE_SALE',
            payload: {
              ...validSalePayload,
              tenantId: 'injected-tenant',
            },
          },
        ],
      };

      const parsed = SyncBatchSchema.safeParse(injectedPayload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
      }
    });
  });

  describe('parseSalesDateRange & QuerySalesSchema Contract', () => {
    it('accepts valid calendar dates and leap year 2024-02-29', () => {
      const result = parseSalesDateRange('2024-02-29', '2024-02-29');
      expect(result.fromUtc).toEqual(new Date('2024-02-29T00:00:00.000Z'));
      expect(result.toExclusiveUtc).toEqual(new Date('2024-03-01T00:00:00.000Z'));
    });

    it('rejects 2025-02-29 (non-leap year)', () => {
      expect(() => parseSalesDateRange('2025-02-29')).toThrow(/inexistente/);
    });

    it('rejects 2026-02-31 (impossible date)', () => {
      expect(() => parseSalesDateRange('2026-02-31')).toThrow(/inexistente/);
    });

    it('rejects 2026-04-31 (impossible date for 30-day month)', () => {
      expect(() => parseSalesDateRange(undefined, '2026-04-31')).toThrow(/inexistente/);
    });

    it('rejects month 00 and 13', () => {
      expect(() => parseSalesDateRange('2026-00-10')).toThrow(/Fecha inválida/);
      expect(() => parseSalesDateRange('2026-13-01')).toThrow(/Fecha inválida/);
    });

    it('rejects day 00', () => {
      expect(() => parseSalesDateRange('2026-05-00')).toThrow(/Fecha inválida/);
    });

    it('rejects partial formats', () => {
      expect(() => parseSalesDateRange('2026-05')).toThrow(/Formato de fecha inválido/);
      expect(() => parseSalesDateRange('abc')).toThrow(/Formato de fecha inválido/);
    });

    it('rejects ISO timestamps with time', () => {
      expect(() => parseSalesDateRange('2026-05-15T12:00:00.000Z')).toThrow(
        /Formato de fecha inválido/
      );
    });

    it('rejects when from is strictly after to', () => {
      expect(() => parseSalesDateRange('2026-05-20', '2026-05-10')).toThrow(
        /no puede ser posterior/
      );
    });

    it('produces identical bounds for single day filter from=to', () => {
      const result = parseSalesDateRange('2026-06-01', '2026-06-01');
      expect(result.fromUtc).toEqual(new Date('2026-06-01T00:00:00.000Z'));
      expect(result.toExclusiveUtc).toEqual(new Date('2026-06-02T00:00:00.000Z'));
    });
  });

  describe('QuerySalesSchema Validation', () => {
    it('validates and applies defaults for empty query', () => {
      const parsed = QuerySalesSchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.from).toBeUndefined();
      expect(parsed.to).toBeUndefined();
    });

    it('coerces string numbers and validates valid date formats', () => {
      const parsed = QuerySalesSchema.parse({
        page: '2',
        limit: '50',
        from: '2026-05-01',
        to: '2026-05-31',
        search: 'havanna',
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.from).toBe('2026-05-01');
      expect(parsed.to).toBe('2026-05-31');
      expect(parsed.search).toBe('havanna');
    });

    it('transforms empty date strings to undefined', () => {
      const parsed = QuerySalesSchema.parse({ from: '', to: '', page: '1', limit: '20' });
      expect(parsed.from).toBeUndefined();
      expect(parsed.to).toBeUndefined();
    });

    it('rejects page=abc', () => {
      expect(() => QuerySalesSchema.parse({ page: 'abc' })).toThrow();
    });

    it('rejects page=2abc', () => {
      expect(() => QuerySalesSchema.parse({ page: '2abc' })).toThrow();
    });

    it('rejects page=0', () => {
      expect(() => QuerySalesSchema.parse({ page: '0' })).toThrow();
    });

    it('rejects page=-1', () => {
      expect(() => QuerySalesSchema.parse({ page: '-1' })).toThrow();
    });

    it('rejects page=1.5', () => {
      expect(() => QuerySalesSchema.parse({ page: '1.5' })).toThrow();
    });

    it('rejects limit=0', () => {
      expect(() => QuerySalesSchema.parse({ limit: '0' })).toThrow();
    });

    it('rejects negative limit', () => {
      expect(() => QuerySalesSchema.parse({ limit: '-5' })).toThrow();
    });

    it('rejects limit exceeding 100', () => {
      expect(() => QuerySalesSchema.parse({ limit: '101' })).toThrow();
    });

    it('rejects invalid date format in from/to', () => {
      expect(() => QuerySalesSchema.parse({ from: '2026-5-1' })).toThrow();
    });

    it('rejects impossible calendar date via superRefine', () => {
      expect(() => QuerySalesSchema.parse({ from: '2026-02-31' })).toThrow();
    });

    it('rejects when from is after to via superRefine', () => {
      expect(() => QuerySalesSchema.parse({ from: '2026-09-10', to: '2026-09-01' })).toThrow();
    });
  });
});
