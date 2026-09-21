import { z } from 'zod';
import { parseSalesDateRange } from '../sales/sales.schema.js';

export const CashShiftStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type CashShiftStatus = z.infer<typeof CashShiftStatusSchema>;

export const CashMovementTypeSchema = z.enum([
  'OPENING',
  'SALE',
  'CASH_IN',
  'CASH_OUT',
  'CLOSING',
  'REFUND',
]);
export type CashMovementType = z.infer<typeof CashMovementTypeSchema>;

export const OpenCashShiftCommandSchema = z
  .object({
    openingAmountCents: z
      .number({ invalid_type_error: 'El fondo inicial debe ser un número entero en centavos' })
      .int('El fondo inicial debe ser un número entero en centavos')
      .nonnegative('El fondo inicial debe ser mayor o igual a 0'),
    idempotencyKey: z.string().uuid('Clave de idempotencia inválida'),
  })
  .strict();
export type OpenCashShiftCommand = z.infer<typeof OpenCashShiftCommandSchema>;

export const CloseCashShiftCommandSchema = z
  .object({
    countedAmountCents: z
      .number({ invalid_type_error: 'El efectivo contado debe ser un número entero en centavos' })
      .int('El efectivo contado debe ser un número entero en centavos')
      .nonnegative('El efectivo contado debe ser mayor o igual a 0'),
    motivo: z
      .string({ invalid_type_error: 'El motivo debe ser texto' })
      .trim()
      .min(3, 'El motivo debe tener al menos 3 caracteres')
      .max(255, 'El motivo no puede exceder 255 caracteres')
      .optional(),
    idempotencyKey: z.string().uuid('Clave de idempotencia inválida'),
  })
  .strict();
export type CloseCashShiftCommand = z.infer<typeof CloseCashShiftCommandSchema>;

export const CreateCashMovementCommandSchema = z
  .object({
    amountCents: z
      .number({ invalid_type_error: 'El monto debe ser un número entero en centavos' })
      .int('El monto debe ser un número entero en centavos')
      .positive('El monto debe ser un entero positivo mayor a 0'),
    reason: z
      .string({ invalid_type_error: 'El motivo es obligatorio' })
      .trim()
      .min(3, 'El motivo debe tener al menos 3 caracteres')
      .max(255, 'El motivo no puede exceder 255 caracteres'),
    idempotencyKey: z.string().uuid('Clave de idempotencia inválida'),
  })
  .strict();
export type CreateCashMovementCommand = z.infer<typeof CreateCashMovementCommandSchema>;

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

export const QueryCashShiftsSchema = z
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
    status: CashShiftStatusSchema.optional(),
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
export type QueryCashShifts = z.infer<typeof QueryCashShiftsSchema>;

export const CashMovementResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  shiftId: z.string(),
  createdByUserId: z.string(),
  createdByUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  type: CashMovementTypeSchema,
  amountCents: z.number().int(),
  signedAmountCents: z.number().int(),
  reason: z.string().nullable().optional(),
  saleId: z.string().nullable().optional(),
  purchaseId: z.string().nullable().optional(),
  idempotencyKey: z.string(),
  createdAtUtc: z.string(),
});
export type CashMovementResponse = z.infer<typeof CashMovementResponseSchema>;

export const CashShiftSummarySchema = z.object({
  openingAmountCents: z.number().int(),
  cashSalesAmountCents: z.number().int(),
  cashInAmountCents: z.number().int(),
  cashOutAmountCents: z.number().int(),
  purchaseAmountCents: z.number().int().optional(),
  refundAmountCents: z.number().int(),
  expectedAmountCents: z.number().int(),
  movementsCount: z.number().int(),
  salesCount: z.number().int(),
});
export type CashShiftSummary = z.infer<typeof CashShiftSummarySchema>;

export const CashShiftResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  openedByUserId: z.string(),
  openedByUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  closedByUserId: z.string().nullable().optional(),
  closedByUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .nullable()
    .optional(),
  status: CashShiftStatusSchema,
  openingAmountCents: z.number().int(),
  expectedAmountCents: z.number().int().nullable().optional(),
  countedAmountCents: z.number().int().nullable().optional(),
  differenceAmountCents: z.number().int().nullable().optional(),
  openedAtUtc: z.string(),
  closedAtUtc: z.string().nullable().optional(),
  summary: CashShiftSummarySchema.optional(),
  movements: z.array(CashMovementResponseSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CashShiftResponse = z.infer<typeof CashShiftResponseSchema>;

export const PaginatedCashShiftsResponseSchema = z.object({
  items: z.array(CashShiftResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedCashShiftsResponse = z.infer<typeof PaginatedCashShiftsResponseSchema>;
