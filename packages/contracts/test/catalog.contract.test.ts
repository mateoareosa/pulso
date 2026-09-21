import { describe, it, expect } from 'vitest';
import {
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  updateLocationSettingsSchema,
  createStockAdjustmentSchema,
  productSearchQuerySchema,
  productImportColumnSchema,
  productImportRowSchema,
  productImportRowErrorSchema,
  productImportPreviewResponseSchema,
  productImportCommitSchema,
  productImportResultSchema,
} from '../src/catalog/catalog.schema.js';

describe('Catalog & Inventory Contracts (Zod)', () => {
  describe('createCategorySchema', () => {
    it('accepts valid category name', () => {
      const result = createCategorySchema.safeParse({ name: 'Golosinas y Snacks' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Golosinas y Snacks');
      }
    });

    it('rejects empty name or whitespace', () => {
      const result = createCategorySchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });

    it('rejects injected tenantId or unknown fields', () => {
      const result = createCategorySchema.safeParse({
        name: 'Bebidas',
        tenantId: 'tenant-injected-id',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateCategorySchema', () => {
    it('accepts valid category update', () => {
      const result = updateCategorySchema.safeParse({ name: 'Snacks Salados', isActive: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Snacks Salados');
        expect(result.data.isActive).toBe(false);
      }
    });

    it('accepts partial update', () => {
      const result = updateCategorySchema.safeParse({ isActive: true });
      expect(result.success).toBe(true);
    });

    it('rejects empty string name', () => {
      const result = updateCategorySchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });
  });

  describe('createProductSchema', () => {
    it('accepts valid product with required fields', () => {
      const result = createProductSchema.safeParse({
        name: 'Alfajor Triple',
        salePriceCents: 120000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Alfajor Triple');
        expect(result.data.salePriceCents).toBe(120000);
        expect(result.data.unit).toBe('UNIT');
        expect(result.data.isAvailable).toBe(true);
      }
    });

    it('accepts valid product with all optional attributes', () => {
      const result = createProductSchema.safeParse({
        name: 'Gaseosa Cola 500ml',
        categoryId: 'cat-123',
        barcode: '7791234567890',
        sku: 'BEB-001',
        salePriceCents: 150000,
        costPriceCents: 90000,
        unit: 'UNIT',
        initialStock: '24.0000',
        minimumStock: '6.0000',
        quickSlot: 1,
        isAvailable: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive salePriceCents (0 or negative)', () => {
      expect(
        createProductSchema.safeParse({
          name: 'Producto Gratis',
          salePriceCents: 0,
        }).success
      ).toBe(false);

      expect(
        createProductSchema.safeParse({
          name: 'Producto Negativo',
          salePriceCents: -500,
        }).success
      ).toBe(false);
    });

    it('rejects decimal salePriceCents', () => {
      const result = createProductSchema.safeParse({
        name: 'Precio Decimal',
        salePriceCents: 120.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative costPriceCents', () => {
      const result = createProductSchema.safeParse({
        name: 'Costo Negativo',
        salePriceCents: 1000,
        costPriceCents: -100,
      });
      expect(result.success).toBe(false);
    });

    it('rejects quickSlot outside 1-8', () => {
      expect(
        createProductSchema.safeParse({
          name: 'Slot 0',
          salePriceCents: 1000,
          quickSlot: 0,
        }).success
      ).toBe(false);

      expect(
        createProductSchema.safeParse({
          name: 'Slot 9',
          salePriceCents: 1000,
          quickSlot: 9,
        }).success
      ).toBe(false);
    });

    it('rejects injected tenantId, locationId, or userId', () => {
      const result = createProductSchema.safeParse({
        name: 'Injected Test',
        salePriceCents: 1000,
        tenantId: 'hacked-tenant',
        locationId: 'hacked-location',
        userId: 'hacked-user',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateProductSchema', () => {
    it('accepts valid partial product update', () => {
      const result = updateProductSchema.safeParse({
        name: 'Nuevo Nombre Alfajor',
        salePriceCents: 140000,
        isActive: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Nuevo Nombre Alfajor');
        expect(result.data.salePriceCents).toBe(140000);
      }
    });

    it('rejects invalid salePriceCents on update', () => {
      const result = updateProductSchema.safeParse({
        salePriceCents: -50,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateLocationSettingsSchema', () => {
    it('accepts valid quickSlot and minimumStock', () => {
      const result = updateLocationSettingsSchema.safeParse({
        quickSlot: 3,
        minimumStock: '10.0000',
        isAvailable: false,
      });
      expect(result.success).toBe(true);
    });

    it('allows clearing quickSlot with null', () => {
      const result = updateLocationSettingsSchema.safeParse({
        quickSlot: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid quickSlot numbers', () => {
      const result = updateLocationSettingsSchema.safeParse({
        quickSlot: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createStockAdjustmentSchema', () => {
    it('accepts valid stock adjustment with mandatory reason', () => {
      const result = createStockAdjustmentSchema.safeParse({
        type: 'ADJUSTMENT_IN',
        quantity: '12.0000',
        reason: 'Reposición de mercadería según remito #4592',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty or whitespace reason', () => {
      const result = createStockAdjustmentSchema.safeParse({
        type: 'ADJUSTMENT_IN',
        quantity: '5.0000',
        reason: '   ',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown movement type', () => {
      const result = createStockAdjustmentSchema.safeParse({
        type: 'MAGIC_INSPECTION',
        quantity: '5.0000',
        reason: 'Auditoría',
      });
      expect(result.success).toBe(false);
    });

    it('rejects injected tenantId or locationId', () => {
      const result = createStockAdjustmentSchema.safeParse({
        type: 'COUNT_CORRECTION',
        quantity: '10.0000',
        reason: 'Recuento físico fin de mes',
        tenantId: 'injected-id',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('productSearchQuerySchema', () => {
    it('parses valid search query with default pagination', () => {
      const result = productSearchQuerySchema.safeParse({
        q: 'alfajor',
        page: '2',
        limit: '20',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('alfajor');
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(20);
      }
    });

    it('clamps limit to maximum 100 defensively', () => {
      const result = productSearchQuerySchema.safeParse({
        limit: '500',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid status filters', () => {
      expect(productSearchQuerySchema.safeParse({ status: 'ALL' }).success).toBe(true);
      expect(productSearchQuerySchema.safeParse({ status: 'ACTIVE' }).success).toBe(true);
      expect(productSearchQuerySchema.safeParse({ status: 'INACTIVE' }).success).toBe(true);
      expect(productSearchQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
    });

    it('accepts a trimmed exact barcode lookup', () => {
      const result = productSearchQuerySchema.safeParse({ barcode: '  7791234567890  ' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.barcode).toBe('7791234567890');
      }
    });

    it('rejects empty or oversized exact barcode lookups', () => {
      expect(productSearchQuerySchema.safeParse({ barcode: '   ' }).success).toBe(false);
      expect(productSearchQuerySchema.safeParse({ barcode: '7'.repeat(65) }).success).toBe(false);
    });
  });

  describe('bulk product import contracts', () => {
    const validRow = {
      row: 2,
      name: 'Yerba mate 1 kg',
      category: 'Almacén',
      barcode: '7790000000012',
      sku: 'YERBA-1KG',
      salePriceCents: 450000,
      costPriceCents: 310000,
      unit: 'UNIT',
      initialStock: '12.0000',
      minimumStock: '2.0000',
      quickSlot: 3,
      isAvailable: true,
    };

    it('accepts only the canonical product import columns', () => {
      expect(productImportColumnSchema.parse('name')).toBe('name');
      expect(productImportColumnSchema.parse('salePriceCents')).toBe('salePriceCents');
      expect(productImportColumnSchema.safeParse('tenantId').success).toBe(false);
      expect(productImportColumnSchema.safeParse('locationId').success).toBe(false);
    });

    it('accepts a normalized preview row and rejects injected scope fields', () => {
      expect(productImportRowSchema.parse(validRow)).toEqual(validRow);
      expect(
        productImportRowSchema.safeParse({ ...validRow, tenantId: 'tenant-injected' }).success
      ).toBe(false);
    });

    it('accepts deterministic row errors and rejects invalid row numbers', () => {
      const error = {
        row: 4,
        field: 'salePriceCents' as const,
        code: 'INVALID_PRICE',
        message: 'El precio de venta debe ser positivo',
      };

      expect(productImportRowErrorSchema.parse(error)).toEqual(error);
      expect(productImportRowErrorSchema.safeParse({ ...error, row: 1 }).success).toBe(false);
    });

    it('validates preview summary consistency and commit eligibility', () => {
      const preview = {
        previewToken: 'signed-preview-token',
        expiresAt: '2026-09-20T20:00:00.000Z',
        rows: [validRow],
        errors: [],
        summary: { total: 1, valid: 1, invalid: 0, createdCategories: 1 },
        canCommit: true,
      };

      expect(productImportPreviewResponseSchema.parse(preview)).toEqual(preview);
      expect(
        productImportPreviewResponseSchema.safeParse({
          ...preview,
          errors: [
            {
              row: 2,
              field: 'salePriceCents',
              code: 'INVALID_PRICE',
              message: 'El precio es inválido',
            },
          ],
          summary: { ...preview.summary, valid: 0, invalid: 1 },
          canCommit: false,
        }).success
      ).toBe(true);
      expect(
        productImportPreviewResponseSchema.safeParse({
          ...preview,
          summary: { ...preview.summary, total: 2 },
        }).success
      ).toBe(false);
    });

    it('requires explicit confirmation and validates the import result', () => {
      expect(
        productImportCommitSchema.parse({
          previewToken: 'signed-preview-token',
          confirmation: true,
        })
      ).toEqual({ previewToken: 'signed-preview-token', confirmation: true });
      expect(
        productImportCommitSchema.safeParse({
          previewToken: 'signed-preview-token',
          confirmation: false,
        }).success
      ).toBe(false);

      expect(
        productImportResultSchema.parse({
          importedCount: 1,
          categoryCount: 1,
          auditId: 'audit-1',
        })
      ).toEqual({ importedCount: 1, categoryCount: 1, auditId: 'audit-1' });
    });
  });
});
