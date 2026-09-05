import { z } from 'zod';

export const TenderTypeSchema = z.enum(['CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'OTHER']);
export type TenderType = z.infer<typeof TenderTypeSchema>;

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

export const CreateSaleCommandSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  shiftId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  items: z.array(SaleLineSchema).min(1),
  tenders: z.array(TenderRecordSchema).min(1),
  totalCents: z.number().int().nonnegative(),
  createdAtUtc: z.string().datetime({ offset: true }).or(z.string().datetime()),
});
export type CreateSaleCommand = z.infer<typeof CreateSaleCommandSchema>;

export const SyncOperationSchema = z.object({
  operationId: z.string().uuid(),
  deviceId: z.string().min(1),
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  type: z.enum(['CREATE_SALE', 'CASH_MOVEMENT']),
  payload: CreateSaleCommandSchema,
  localTimestamp: z.string().datetime(),
  schemaVersion: z.number().int().default(1),
});
export type SyncOperation = z.infer<typeof SyncOperationSchema>;
