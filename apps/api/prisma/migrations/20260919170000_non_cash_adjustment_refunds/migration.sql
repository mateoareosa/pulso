-- Non-cash returns restore inventory immediately while settlement remains manual/pending.
ALTER TYPE "SaleAdjustmentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TABLE "sale_adjustments" ALTER COLUMN "shiftId" DROP NOT NULL;
