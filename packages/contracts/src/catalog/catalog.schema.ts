import { z } from 'zod';

/**
 * Decimal string validator that ensures precise non-negative decimal representation
 * (e.g. "12.0000", "0.5000", "0") without floating point errors.
 */
export const decimalStringSchema = z
  .union([
    z.string().regex(/^\d+(\.\d{1,4})?$/, 'Formato decimal inválido (hasta 4 decimales)'),
    z
      .number()
      .nonnegative()
      .transform((val) => val.toFixed(4)),
  ])
  .transform((val) => (typeof val === 'string' ? val : (val as number).toFixed(4)));

// ==========================================
// CATEGORIES
// ==========================================

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  })
  .strict();

export type CreateCategoryCommand = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre no puede estar vacío')
      .max(100, 'Máximo 100 caracteres')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateCategoryCommand = z.infer<typeof updateCategorySchema>;

export const categoryResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

// ==========================================
// PRODUCTS
// ==========================================

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'Máximo 200 caracteres'),
    categoryId: z.string().trim().min(1).nullable().optional(),
    barcode: z.string().trim().min(1).max(64, 'Máximo 64 caracteres').nullable().optional(),
    sku: z.string().trim().min(1).max(64, 'Máximo 64 caracteres').nullable().optional(),
    salePriceCents: z
      .number()
      .int('El precio debe ser un entero de centavos')
      .positive('El precio de venta debe ser positivo'),
    costPriceCents: z
      .number()
      .int('El costo debe ser un entero de centavos')
      .nonnegative('El costo debe ser mayor o igual a cero')
      .nullable()
      .optional(),
    unit: z.string().trim().min(1).max(20).default('UNIT'),
    initialStock: decimalStringSchema.default('0.0000'),
    minimumStock: decimalStringSchema.default('0.0000'),
    quickSlot: z
      .number()
      .int()
      .min(1, 'Slot mínimo: 1')
      .max(8, 'Slot máximo: 8')
      .nullable()
      .optional(),
    isAvailable: z.boolean().default(true),
  })
  .strict();

export type CreateProductCommand = z.input<typeof createProductSchema>;
export type CreateProductParsed = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre no puede estar vacío')
      .max(200, 'Máximo 200 caracteres')
      .optional(),
    categoryId: z.string().trim().min(1).nullable().optional(),
    barcode: z.string().trim().min(1).max(64, 'Máximo 64 caracteres').nullable().optional(),
    sku: z.string().trim().min(1).max(64, 'Máximo 64 caracteres').nullable().optional(),
    salePriceCents: z
      .number()
      .int('El precio debe ser un entero de centavos')
      .positive('El precio de venta debe ser positivo')
      .optional(),
    costPriceCents: z
      .number()
      .int('El costo debe ser un entero de centavos')
      .nonnegative('El costo debe ser mayor o igual a cero')
      .nullable()
      .optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateProductCommand = z.infer<typeof updateProductSchema>;

export const updateLocationSettingsSchema = z
  .object({
    quickSlot: z
      .number()
      .int()
      .min(1, 'Slot mínimo: 1')
      .max(8, 'Slot máximo: 8')
      .nullable()
      .optional(),
    minimumStock: decimalStringSchema.optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

export type UpdateLocationSettingsCommand = z.infer<typeof updateLocationSettingsSchema>;

// ==========================================
// INVENTORY MOVEMENTS & STOCK ADJUSTMENTS
// ==========================================

export const INVENTORY_MOVEMENT_TYPES = [
  'INITIAL',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'COUNT_CORRECTION',
  'SALE',
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const createStockAdjustmentSchema = z
  .object({
    type: z.enum(INVENTORY_MOVEMENT_TYPES, {
      message: 'Tipo de movimiento inválido',
    }),
    quantity: decimalStringSchema,
    reason: z.string().trim().min(3, 'El motivo es obligatorio (mínimo 3 caracteres)').max(500),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CreateStockAdjustmentCommand = z.infer<typeof createStockAdjustmentSchema>;

// ==========================================
// SEARCH & QUERY
// ==========================================

export const productSearchQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    categoryId: z.string().trim().optional(),
    barcode: z.string().trim().optional(),
    onlyAvailable: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .optional(),
    includeInactive: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .optional(),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100, 'Límite máximo 100').default(50).optional(),
  })
  .strict();

export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;

// ==========================================
// RESPONSES
// ==========================================

export const productLocationResponseSchema = z.object({
  productId: z.string(),
  locationId: z.string(),
  stockQuantity: z.string(),
  minimumStock: z.string(),
  isAvailable: z.boolean(),
  quickSlot: z.number().int().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProductLocationResponse = z.infer<typeof productLocationResponseSchema>;

export const productResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  normalizedName: z.string(),
  barcode: z.string().nullable(),
  sku: z.string().nullable(),
  salePriceCents: z.number().int(),
  costPriceCents: z.number().int().nullable(),
  unit: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  locationSettings: productLocationResponseSchema.nullable().optional(),
});

export type ProductResponse = z.infer<typeof productResponseSchema>;

export const stockMovementResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  productId: z.string(),
  type: z.enum(INVENTORY_MOVEMENT_TYPES),
  delta: z.string(),
  previousStock: z.string(),
  resultingStock: z.string(),
  reason: z.string(),
  userId: z.string(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  createdAt: z.string(),
});

export type StockMovementResponse = z.infer<typeof stockMovementResponseSchema>;

export const paginatedProductsResponseSchema = z.object({
  items: z.array(productResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export type PaginatedProductsResponse = z.infer<typeof paginatedProductsResponseSchema>;
