import { z } from 'zod';
import { parseSalesDateRange } from '../sales/sales.schema.js';

// ==========================================
// SUPPLIERS SCHEMAS
// ==========================================

export const CreateSupplierCommandSchema = z
  .object({
    name: z
      .string({ invalid_type_error: 'El nombre del proveedor es obligatorio' })
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(120, 'El nombre no puede exceder 120 caracteres'),
    taxId: z
      .string()
      .trim()
      .regex(
        /^\d{2}-?\d{8}-?\d{1}$/,
        'El CUIT debe tener un formato válido (ej. 20-12345678-9 o 20123456789)'
      )
      .transform((val) => val.replace(/-/g, ''))
      .optional()
      .nullable(),
    phone: z
      .string()
      .trim()
      .max(40, 'El teléfono no puede exceder 40 caracteres')
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .email('El correo electrónico no es válido')
      .max(100)
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(200, 'La dirección no puede exceder 200 caracteres')
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(500, 'Las notas no pueden exceder 500 caracteres')
      .optional()
      .nullable(),
  })
  .strict();
export type CreateSupplierCommand = z.infer<typeof CreateSupplierCommandSchema>;

export const UpdateSupplierCommandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(120, 'El nombre no puede exceder 120 caracteres')
      .optional(),
    taxId: z
      .string()
      .trim()
      .regex(/^\d{2}-?\d{8}-?\d{1}$/, 'El CUIT debe tener un formato válido')
      .transform((val) => val.replace(/-/g, ''))
      .optional()
      .nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    email: z
      .string()
      .trim()
      .email('El correo electrónico no es válido')
      .max(100)
      .optional()
      .nullable(),
    address: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateSupplierCommand = z.infer<typeof UpdateSupplierCommandSchema>;

export const QuerySuppliersSchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: 'La página debe ser un número entero' })
      .int('La página debe ser un número entero')
      .positive('La página debe ser mayor a 0')
      .optional()
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: 'El límite debe ser un número entero' })
      .int('El límite debe ser un número entero')
      .positive('El límite debe ser mayor a 0')
      .max(100, 'El límite máximo es 100')
      .optional()
      .default(20),
    search: z.string().trim().optional(),
    isActive: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
      }),
  })
  .strict();
export type QuerySuppliers = z.infer<typeof QuerySuppliersSchema>;

export const SupplierResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  taxId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupplierResponse = z.infer<typeof SupplierResponseSchema>;

export const PaginatedSuppliersResponseSchema = z.object({
  items: z.array(SupplierResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedSuppliersResponse = z.infer<typeof PaginatedSuppliersResponseSchema>;

// ==========================================
// PURCHASES SCHEMAS
// ==========================================

export const PurchaseStatusSchema = z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']);
export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;

export const PurchasePaymentSourceSchema = z.enum(['CASH_REGISTER', 'OUTSIDE_CASH', 'UNSPECIFIED']);
export type PurchasePaymentSource = z.infer<typeof PurchasePaymentSourceSchema>;

export const PurchaseItemLineSchema = z
  .object({
    productId: z.string().min(1, 'El ID de producto es obligatorio'),
    quantity: z
      .number({ invalid_type_error: 'La cantidad debe ser un entero positivo' })
      .int('La cantidad debe ser un número entero')
      .positive('La cantidad debe ser mayor a 0'),
    unitCostCents: z
      .number({ invalid_type_error: 'El costo unitario debe ser un número entero en centavos' })
      .int('El costo unitario debe ser un entero')
      .nonnegative('El costo unitario no puede ser negativo'),
  })
  .strict();
export type PurchaseItemLine = z.infer<typeof PurchaseItemLineSchema>;

export const CreatePurchaseDraftCommandSchema = z
  .object({
    supplierId: z.string().min(1, 'El proveedor es obligatorio'),
    documentNumber: z
      .string()
      .trim()
      .max(50, 'El número de comprobante no puede exceder 50 caracteres')
      .optional()
      .nullable(),
    purchasedAtUtc: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    discountCents: z
      .number({ invalid_type_error: 'El descuento debe ser un número entero en centavos' })
      .int('El descuento debe ser un entero')
      .nonnegative('El descuento no puede ser negativo')
      .default(0),
    additionalCostCents: z
      .number({ invalid_type_error: 'El costo adicional debe ser un número entero en centavos' })
      .int('El costo adicional debe ser un entero')
      .nonnegative('El costo adicional no puede ser negativo')
      .default(0),
    paymentSource: PurchasePaymentSourceSchema.default('UNSPECIFIED'),
    notes: z
      .string()
      .trim()
      .max(500, 'Las notas no pueden exceder 500 caracteres')
      .optional()
      .nullable(),
    items: z
      .array(PurchaseItemLineSchema)
      .min(1, 'Debe incluir al menos un producto en la compra')
      .refine(
        (items) => {
          const ids = items.map((i) => i.productId);
          return new Set(ids).size === ids.length;
        },
        { message: 'No se permiten productos duplicados en las líneas de la compra' }
      ),
  })
  .strict();
export type CreatePurchaseDraftCommand = z.infer<typeof CreatePurchaseDraftCommandSchema>;

export const UpdatePurchaseDraftCommandSchema = z
  .object({
    supplierId: z.string().min(1, 'El proveedor es obligatorio').optional(),
    documentNumber: z.string().trim().max(50).optional().nullable(),
    purchasedAtUtc: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    discountCents: z.number().int().nonnegative().optional(),
    additionalCostCents: z.number().int().nonnegative().optional(),
    paymentSource: PurchasePaymentSourceSchema.optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z
      .array(PurchaseItemLineSchema)
      .min(1, 'Debe incluir al menos un producto en la compra')
      .refine(
        (items) => {
          const ids = items.map((i) => i.productId);
          return new Set(ids).size === ids.length;
        },
        { message: 'No se permiten productos duplicados en las líneas de la compra' }
      )
      .optional(),
  })
  .strict();
export type UpdatePurchaseDraftCommand = z.infer<typeof UpdatePurchaseDraftCommandSchema>;

export const ReceivePurchaseCommandSchema = z
  .object({
    idempotencyKey: z.string().uuid('Clave de idempotencia inválida'),
    paymentSource: PurchasePaymentSourceSchema.optional(),
  })
  .strict();
export type ReceivePurchaseCommand = z.infer<typeof ReceivePurchaseCommandSchema>;

export const CancelPurchaseCommandSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(255, 'El motivo no puede exceder 255 caracteres')
      .optional()
      .nullable(),
  })
  .strict();
export type CancelPurchaseCommand = z.infer<typeof CancelPurchaseCommandSchema>;

const optionalDateString = z
  .union([z.string().trim(), z.undefined()])
  .transform((v) => (v === '' ? undefined : v))
  .pipe(
    z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'Formato de fecha inválido. Se requiere exclusivamente YYYY-MM-DD.'
      )
      .optional()
  );

export const QueryPurchasesSchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: 'La página debe ser un número entero' })
      .int('La página debe ser un número entero')
      .positive('La página debe ser mayor a 0')
      .optional()
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: 'El límite debe ser un número entero' })
      .int('El límite debe ser un número entero')
      .positive('El límite debe ser mayor a 0')
      .max(100, 'El límite máximo es 100')
      .optional()
      .default(20),
    supplierId: z.string().optional(),
    status: PurchaseStatusSchema.optional(),
    from: optionalDateString,
    to: optionalDateString,
    search: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from || data.to) {
      try {
        parseSalesDateRange(data.from, data.to);
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Parámetros de fecha inválidos',
          path: ['from'],
        });
      }
    }
  });
export type QueryPurchases = z.infer<typeof QueryPurchasesSchema>;

export const PurchaseItemResponseSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  productId: z.string(),
  productNameSnapshot: z.string(),
  barcodeSnapshot: z.string().nullable().optional(),
  quantity: z.number().int(),
  unitCostCents: z.number().int(),
  lineTotalCents: z.number().int(),
  currentStock: z.string().optional(),
  salePriceCents: z.number().int().optional(),
  lastCostCents: z.number().int().nullable().optional(),
  createdAt: z.string(),
});
export type PurchaseItemResponse = z.infer<typeof PurchaseItemResponseSchema>;

export const PurchaseResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  supplierId: z.string(),
  supplier: z
    .object({
      id: z.string(),
      name: z.string(),
      taxId: z.string().nullable().optional(),
    })
    .optional(),
  status: PurchaseStatusSchema,
  documentNumber: z.string().nullable().optional(),
  purchasedAtUtc: z.string(),
  receivedAtUtc: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdByUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  receivedByUserId: z.string().nullable().optional(),
  receivedByUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .nullable()
    .optional(),
  cancelledByUserId: z.string().nullable().optional(),
  cancelledAtUtc: z.string().nullable().optional(),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  additionalCostCents: z.number().int(),
  totalCents: z.number().int(),
  paymentSource: PurchasePaymentSourceSchema,
  cashShiftId: z.string().nullable().optional(),
  cashMovementId: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  itemsCount: z.number().int().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PurchaseResponse = z.infer<typeof PurchaseResponseSchema>;

export const PurchaseDetailResponseSchema = PurchaseResponseSchema.extend({
  items: z.array(PurchaseItemResponseSchema),
});
export type PurchaseDetailResponse = z.infer<typeof PurchaseDetailResponseSchema>;

export const PaginatedPurchasesResponseSchema = z.object({
  items: z.array(PurchaseResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedPurchasesResponse = z.infer<typeof PaginatedPurchasesResponseSchema>;
