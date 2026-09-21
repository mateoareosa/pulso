import { describe, it, expect } from 'vitest';
import {
  CreateSupplierCommandSchema,
  UpdateSupplierCommandSchema,
  QuerySuppliersSchema,
  CreatePurchaseDraftCommandSchema,
  ReceivePurchaseCommandSchema,
  QueryPurchasesSchema,
} from '../src/purchases/purchases.schema.js';

describe('Suppliers & Purchases Contract Validation Suite', () => {
  describe('Supplier Contracts', () => {
    it('validates a valid supplier command and normalizes CUIT', () => {
      const valid = {
        name: 'Distribuidora Arcor S.A.',
        taxId: '30-12345678-9',
        phone: '11-4567-8901',
        email: 'ventas@arcor.com.ar',
        address: 'Av. Corrientes 1234',
        notes: 'Entrega los martes por la mañana',
      };
      const result = CreateSupplierCommandSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Distribuidora Arcor S.A.');
        expect(result.data.taxId).toBe('30123456789');
      }
    });

    it('rejects short name or invalid CUIT', () => {
      const invalid = {
        name: 'A',
        taxId: '12345',
      };
      const result = CreateSupplierCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates partial updates', () => {
      const update = {
        name: 'Nuevo Nombre',
        isActive: false,
      };
      const result = UpdateSupplierCommandSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it('parses QuerySuppliers with coerced boolean and limits', () => {
      const query = {
        page: '2',
        limit: '50',
        search: 'Arcor',
        isActive: 'true',
      };
      const result = QuerySuppliersSchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
        expect(result.data.isActive).toBe(true);
      }
    });
  });

  describe('Purchase Contracts', () => {
    it('validates valid CreatePurchaseDraftCommand', () => {
      const draft = {
        supplierId: 'supp-123',
        documentNumber: 'FC-A-0001-00001234',
        discountCents: 50000,
        additionalCostCents: 10000,
        paymentSource: 'CASH_REGISTER',
        notes: 'Compra semanal de golosinas',
        items: [
          {
            productId: 'prod-1',
            quantity: 10,
            unitCostCents: 120000,
          },
          {
            productId: 'prod-2',
            quantity: 5,
            unitCostCents: 80000,
          },
        ],
      };
      const result = CreatePurchaseDraftCommandSchema.safeParse(draft);
      expect(result.success).toBe(true);
    });

    it('rejects duplicate products in purchase items', () => {
      const duplicateDraft = {
        supplierId: 'supp-123',
        items: [
          { productId: 'prod-1', quantity: 1, unitCostCents: 100 },
          { productId: 'prod-1', quantity: 2, unitCostCents: 100 },
        ],
      };
      const result = CreatePurchaseDraftCommandSchema.safeParse(duplicateDraft);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('No se permiten productos duplicados');
      }
    });

    it('rejects negative costs or non-positive quantities', () => {
      const invalid = {
        supplierId: 'supp-123',
        items: [{ productId: 'prod-1', quantity: 0, unitCostCents: -50 }],
      };
      const result = CreatePurchaseDraftCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates ReceivePurchaseCommand with UUID idempotency key', () => {
      const validReceive = {
        idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
        paymentSource: 'CASH_REGISTER',
      };
      const result = ReceivePurchaseCommandSchema.safeParse(validReceive);
      expect(result.success).toBe(true);

      const invalidReceive = {
        idempotencyKey: 'not-a-uuid',
      };
      expect(ReceivePurchaseCommandSchema.safeParse(invalidReceive).success).toBe(false);
    });

    it('validates QueryPurchases with date range', () => {
      const validQuery = {
        from: '2026-09-01',
        to: '2026-09-07',
        status: 'RECEIVED',
      };
      expect(QueryPurchasesSchema.safeParse(validQuery).success).toBe(true);

      const invalidRange = {
        from: '2026-09-10',
        to: '2026-09-01',
      };
      expect(QueryPurchasesSchema.safeParse(invalidRange).success).toBe(false);
    });
  });
});
