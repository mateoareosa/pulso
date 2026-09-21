-- Append-only sale adjustments, stock returns and cash refunds.
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "CashMovementType" ADD VALUE IF NOT EXISTS 'REFUND';

CREATE TYPE "SaleAdjustmentType" AS ENUM ('RETURN', 'VOID');
CREATE TYPE "SaleAdjustmentStatus" AS ENUM ('COMPLETED');

CREATE TABLE "sale_adjustments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "type" "SaleAdjustmentType" NOT NULL,
  "status" "SaleAdjustmentStatus" NOT NULL DEFAULT 'COMPLETED',
  "reason" TEXT NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "refundTender" TEXT NOT NULL DEFAULT 'CASH',
  "refundStatus" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_adjustment_items" (
  "id" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  CONSTRAINT "sale_adjustment_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_movements" ADD COLUMN "saleAdjustmentId" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN "saleAdjustmentId" TEXT;

CREATE UNIQUE INDEX "sale_adjustments_tenantId_idempotencyKey_key"
  ON "sale_adjustments"("tenantId", "idempotencyKey");
CREATE INDEX "sale_adjustments_tenantId_locationId_saleId_createdAt_idx"
  ON "sale_adjustments"("tenantId", "locationId", "saleId", "createdAt");
CREATE INDEX "sale_adjustment_items_adjustmentId_idx" ON "sale_adjustment_items"("adjustmentId");
CREATE INDEX "sale_adjustment_items_saleItemId_idx" ON "sale_adjustment_items"("saleItemId");
CREATE INDEX "inventory_movements_saleAdjustmentId_idx" ON "inventory_movements"("saleAdjustmentId");
CREATE INDEX "cash_movements_saleAdjustmentId_idx" ON "cash_movements"("saleAdjustmentId");

ALTER TABLE "sale_adjustments" ADD CONSTRAINT "sale_adjustments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustments" ADD CONSTRAINT "sale_adjustments_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustments" ADD CONSTRAINT "sale_adjustments_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustments" ADD CONSTRAINT "sale_adjustments_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustments" ADD CONSTRAINT "sale_adjustments_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustment_items" ADD CONSTRAINT "sale_adjustment_items_adjustmentId_fkey"
  FOREIGN KEY ("adjustmentId") REFERENCES "sale_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustment_items" ADD CONSTRAINT "sale_adjustment_items_saleItemId_fkey"
  FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_adjustment_items" ADD CONSTRAINT "sale_adjustment_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_saleAdjustmentId_fkey"
  FOREIGN KEY ("saleAdjustmentId") REFERENCES "sale_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_saleAdjustmentId_fkey"
  FOREIGN KEY ("saleAdjustmentId") REFERENCES "sale_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
