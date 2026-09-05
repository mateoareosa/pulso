import { describe, it, expect } from 'vitest';
import {
  CreateSaleCommandSchema,
  TenderTypeSchema,
  SyncBatchSchema,
} from '../src/sales/sales.schema.js';

describe('Sales Contract Validation', () => {
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
});
