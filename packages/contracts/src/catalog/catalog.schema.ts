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
    barcode: z
      .string()
      .trim()
      .min(1, 'El código de barras no puede estar vacío')
      .max(64, 'Máximo 64 caracteres')
      .optional(),
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

// ==========================================
// BULK PRODUCT IMPORT
// ==========================================

export const PRODUCT_IMPORT_COLUMNS = [
  'name',
  'category',
  'barcode',
  'sku',
  'salePriceCents',
  'costPriceCents',
  'unit',
  'initialStock',
  'minimumStock',
  'quickSlot',
  'isAvailable',
] as const;

export const productImportColumnSchema = z.enum(PRODUCT_IMPORT_COLUMNS);
export type ProductImportColumn = z.infer<typeof productImportColumnSchema>;

export const productImportRowSchema = z
  .object({
    row: z.number().int().min(2),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    sku: z.string().trim().min(1).max(64).nullable().optional(),
    salePriceCents: z.number().int().positive(),
    costPriceCents: z.number().int().nonnegative().nullable().optional(),
    unit: z.string().trim().min(1).max(20),
    initialStock: decimalStringSchema,
    minimumStock: decimalStringSchema,
    quickSlot: z.number().int().min(1).max(8).nullable().optional(),
    isAvailable: z.boolean(),
  })
  .strict();

export type ProductImportRow = z.infer<typeof productImportRowSchema>;

export const productImportRowErrorSchema = z
  .object({
    row: z.number().int().min(2),
    field: productImportColumnSchema.optional(),
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export type ProductImportRowError = z.infer<typeof productImportRowErrorSchema>;

export const productImportSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    createdCategories: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.valid + summary.invalid !== summary.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El total debe coincidir con la suma de filas válidas e inválidas',
        path: ['total'],
      });
    }
  });

export type ProductImportSummary = z.infer<typeof productImportSummarySchema>;

// A stateless preview contains up to 500 normalized rows. Keep the token bounded,
// but large enough for the worst-case canonical payload defined above.
export const MAX_PRODUCT_IMPORT_PREVIEW_TOKEN_CHARS = 1_000_000;

export const productImportPreviewResponseSchema = z
  .object({
    previewToken: z.string().trim().min(1).max(MAX_PRODUCT_IMPORT_PREVIEW_TOKEN_CHARS),
    expiresAt: z.string().datetime({ offset: true }),
    rows: z.array(productImportRowSchema).max(500),
    errors: z.array(productImportRowErrorSchema),
    summary: productImportSummarySchema,
    canCommit: z.boolean(),
  })
  .strict()
  .superRefine((preview, context) => {
    if (preview.summary.total !== preview.rows.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El resumen debe corresponder a las filas de la vista previa',
        path: ['summary', 'total'],
      });
    }

    const expectedCanCommit = preview.summary.invalid === 0 && preview.errors.length === 0;
    if (preview.canCommit !== expectedCanCommit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El estado de confirmación no coincide con los errores de la vista previa',
        path: ['canCommit'],
      });
    }
  });

export type ProductImportPreviewResponse = z.infer<typeof productImportPreviewResponseSchema>;

export const productImportCommitSchema = z
  .object({
    previewToken: z.string().trim().min(1).max(MAX_PRODUCT_IMPORT_PREVIEW_TOKEN_CHARS),
    confirmation: z.literal(true),
  })
  .strict();

export type ProductImportCommitCommand = z.infer<typeof productImportCommitSchema>;

export const productImportResultSchema = z
  .object({
    importedCount: z.number().int().nonnegative(),
    categoryCount: z.number().int().nonnegative(),
    auditId: z.string().trim().min(1),
  })
  .strict();

export type ProductImportResult = z.infer<typeof productImportResultSchema>;
