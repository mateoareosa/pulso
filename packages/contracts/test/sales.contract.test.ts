import { describe, it, expect } from 'vitest';
import { CreateSaleCommandSchema, TenderTypeSchema } from '../src/sales/sales.schema';

describe('Sales Contract Validation', () => {
  it('should validate a compliant CreateSaleCommand DTO', () => {
    const validPayload = {
      tenantId: 'tenant-123',
      locationId: 'loc-456',
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

  it('should reject non-integer cents in contracts', () => {
    const invalidPayload = {
      tenantId: 'tenant-123',
      locationId: 'loc-456',
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
    // Financial processor gateway types must NOT be allowed
    expect(TenderTypeSchema.safeParse('STRIPE_CHECKOUT').success).toBe(false);
    expect(TenderTypeSchema.safeParse('MERCADOPAGO_LINK').success).toBe(false);
  });
});
