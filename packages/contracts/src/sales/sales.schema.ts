import { z } from 'zod';

export const TenderTypeSchema = z.enum(['CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'OTHER']);
export type TenderType = z.infer<typeof TenderTypeSchema>;

export const SaleAdjustmentTypeSchema = z.enum(['RETURN', 'VOID']);
export type SaleAdjustmentType = z.infer<typeof SaleAdjustmentTypeSchema>;

export const SaleAdjustmentStatusSchema = z.enum(['COMPLETED', 'PENDING']);
export type SaleAdjustmentStatus = z.infer<typeof SaleAdjustmentStatusSchema>;

const AdjustmentReasonSchema = z.string().trim().min(1).max(500);

export const ReturnSaleCommandSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    reason: AdjustmentReasonSchema,
    items: z
      .array(
        z.object({
          saleItemId: z.string().min(1),
          quantity: z.number().positive().max(999999.9999),
        })
      )
      .min(1),
    refundTender: TenderTypeSchema.optional(),
  })
  .strict()
  .superRefine((command, ctx) => {
    const ids = command.items.map((item) => item.saleItemId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cada línea de venta puede devolverse una sola vez por operación.',
        path: ['items'],
      });
    }
  });
export type ReturnSaleCommand = z.infer<typeof ReturnSaleCommandSchema>;

export const VoidSaleCommandSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    reason: AdjustmentReasonSchema,
  })
  .strict();
export type VoidSaleCommand = z.infer<typeof VoidSaleCommandSchema>;

export const SaleLineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  barcode: z.string().optional(),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
});
export type SaleLine = z.infer<typeof SaleLineSchema>;

export const TenderRecordSchema = z.object({
  type: TenderTypeSchema,
  amountCents: z.number().int().nonnegative(),
  receivedAmountCents: z.number().int().nonnegative().optional(),
  changeAmountCents: z.number().int().nonnegative().optional(),
  reference: z.string().optional(),
});
export type TenderRecord = z.infer<typeof TenderRecordSchema>;

export const CreateSaleCommandSchema = z
  .object({
    shiftId: z.string().optional(),
    idempotencyKey: z.string().uuid(),
    items: z.array(SaleLineSchema).min(1),
    tenders: z.array(TenderRecordSchema).min(1),
    totalCents: z.number().int().nonnegative(),
    createdAtUtc: z.string().datetime({ offset: true }).or(z.string().datetime()),
  })
  .strict();
export type CreateSaleCommand = z.infer<typeof CreateSaleCommandSchema>;

export const SyncOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    deviceId: z.string().min(1),
    type: z.enum(['CREATE_SALE', 'CASH_MOVEMENT']),
    payload: CreateSaleCommandSchema,
    localTimestamp: z.string().datetime(),
    schemaVersion: z.number().int().default(1),
  })
  .strict();
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncBatchOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    type: z.literal('CREATE_SALE'),
    payload: CreateSaleCommandSchema,
  })
  .strict();
export type SyncBatchOperation = z.infer<typeof SyncBatchOperationSchema>;

export const SyncBatchSchema = z
  .object({
    deviceId: z.string().min(1),
    operations: z.array(SyncBatchOperationSchema),
  })
  .strict();
export type SyncBatch = z.infer<typeof SyncBatchSchema>;

export const SaleItemResponseSchema = z.object({
  id: z.string(),
  saleId: z.string(),
  productId: z.string(),
  name: z.string(),
  barcode: z.string().nullable().optional(),
  quantity: z.string(),
  unitPriceCents: z.number().int(),
  totalPriceCents: z.number().int(),
});
export type SaleItemResponse = z.infer<typeof SaleItemResponseSchema>;

export const SaleTenderResponseSchema = z.object({
  id: z.string(),
  saleId: z.string(),
  type: TenderTypeSchema,
  amountCents: z.number().int(),
  receivedAmountCents: z.number().int().nullable().optional(),
  changeAmountCents: z.number().int().nullable().optional(),
  reference: z.string().nullable().optional(),
});
export type SaleTenderResponse = z.infer<typeof SaleTenderResponseSchema>;

export const SaleWarningSchema = z.object({
  productId: z.string(),
  name: z.string(),
  currentStock: z.string(),
  belowZero: z.boolean(),
  belowMin: z.boolean(),
  priceDivergence: z
    .object({
      chargedUnitPriceCents: z.number().int(),
      catalogUnitPriceCents: z.number().int(),
    })
    .optional(),
  message: z.string().optional(),
});
export type SaleWarning = z.infer<typeof SaleWarningSchema>;

export const SyncBatchResultSchema = z.object({
  operationId: z.string(),
  status: z.enum(['SYNCED', 'FAILED']),
  idempotentReplay: z.boolean().optional(),
  saleId: z.string().optional(),
  tenantId: z.string(),
  locationId: z.string(),
  error: z.string().optional(),
  warnings: z.array(SaleWarningSchema).optional(),
});
export type SyncBatchResult = z.infer<typeof SyncBatchResultSchema>;

export const SyncBatchResponseSchema = z.object({
  syncedCount: z.number().int(),
  results: z.array(SyncBatchResultSchema),
});
export type SyncBatchResponse = z.infer<typeof SyncBatchResponseSchema>;

export const SaleResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  userId: z.string(),
  shiftId: z.string().nullable().optional(),
  idempotencyKey: z.string(),
  totalCents: z.number().int(),
  status: z.string(),
  lastError: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  persistedAt: z.string(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  items: z.array(SaleItemResponseSchema).optional(),
  tenders: z.array(SaleTenderResponseSchema).optional(),
  adjustments: z
    .array(
      z.object({
        id: z.string(),
        type: SaleAdjustmentTypeSchema,
        status: SaleAdjustmentStatusSchema,
        reason: z.string(),
        totalCents: z.number().int().nonnegative(),
        refundTender: TenderTypeSchema,
        refundStatus: z.enum(['COMPLETED', 'PENDING']),
        actor: z.object({ id: z.string(), name: z.string(), email: z.string() }),
        createdAt: z.string(),
        items: z.array(
          z.object({
            id: z.string(),
            saleItemId: z.string(),
            productId: z.string(),
            quantity: z.string(),
            unitPriceCents: z.number().int(),
            totalCents: z.number().int(),
          })
        ),
      })
    )
    .optional(),
});
export type SaleResponse = z.infer<typeof SaleResponseSchema>;

export const SaleAdjustmentResponseSchema = z.object({
  adjustment: SaleResponseSchema.shape.adjustments.unwrap().element,
  sale: SaleResponseSchema,
  idempotentReplay: z.boolean(),
});
export type SaleAdjustmentResponse = z.infer<typeof SaleAdjustmentResponseSchema>;

export const SALE_ADJUSTMENT_ERROR_CODES = [
  'SALE_NOT_COMPLETED',
  'RETURN_QUANTITY_EXCEEDED',
  'VOID_AFTER_RETURN',
  'LOCATION_SCOPE',
  'SHIFT_REQUIRED',
  'NON_CASH_REFUND_UNSUPPORTED',
  'IDEMPOTENCY_CONFLICT',
] as const;
export type SaleAdjustmentErrorCode = (typeof SALE_ADJUSTMENT_ERROR_CODES)[number];

export const ProcessSaleResponseSchema = z.object({
  success: z.boolean(),
  sale: SaleResponseSchema,
  idempotentReplay: z.boolean(),
  warnings: z.array(SaleWarningSchema).default([]),
});
export type ProcessSaleResponse = z.infer<typeof ProcessSaleResponseSchema>;

export const PaginatedSalesResponseSchema = z.object({
  items: z.array(SaleResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedSalesResponse = z.infer<typeof PaginatedSalesResponseSchema>;

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

export const QuerySalesSchema = z
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
export type QuerySales = z.infer<typeof QuerySalesSchema>;

export interface ParsedDateRange {
  fromUtc: Date | undefined;
  toExclusiveUtc: Date | undefined;
}

export function parseSalesDateRange(from?: string, to?: string): ParsedDateRange {
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

  const validateAndParseDate = (str: string, paramName: 'from' | 'to'): Date => {
    const trimmed = str.trim();
    if (!dateOnlyRegex.test(trimmed)) {
      throw new Error(
        `Formato de fecha inválido en "${paramName}". Se requiere exclusivamente YYYY-MM-DD.`
      );
    }

    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const y = Number(yearStr);
    const m = Number(monthStr);
    const d = Number(dayStr);

    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
      throw new Error(`Fecha inválida en "${paramName}": "${trimmed}".`);
    }

    const testDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    if (
      isNaN(testDate.getTime()) ||
      testDate.getUTCFullYear() !== y ||
      testDate.getUTCMonth() !== m - 1 ||
      testDate.getUTCDate() !== d
    ) {
      throw new Error(`Fecha de calendario inexistente en "${paramName}": "${trimmed}".`);
    }

    return testDate;
  };

  let fromUtc: Date | undefined;
  let toExclusiveUtc: Date | undefined;

  if (from !== undefined && from !== '') {
    fromUtc = validateAndParseDate(from, 'from');
  }

  if (to !== undefined && to !== '') {
    const toStart = validateAndParseDate(to, 'to');
    toExclusiveUtc = new Date(toStart.getTime() + 86400000);
  }

  if (fromUtc && toExclusiveUtc && fromUtc >= toExclusiveUtc) {
    throw new Error('Rango de fechas inválido: la fecha "from" no puede ser posterior a "to".');
  }

  return { fromUtc, toExclusiveUtc };
}
