CREATE TYPE "ProductImportResult" AS ENUM ('SUCCESS', 'REJECTED');

CREATE TABLE "product_import_audits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "previewTokenHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "result" "ProductImportResult" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "categoryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_import_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_import_audits_tenantId_previewTokenHash_key"
ON "product_import_audits"("tenantId", "previewTokenHash");
CREATE INDEX "product_import_audits_tenantId_locationId_createdAt_id_idx"
ON "product_import_audits"("tenantId", "locationId", "createdAt", "id");
CREATE INDEX "product_import_audits_actorUserId_createdAt_idx"
ON "product_import_audits"("actorUserId", "createdAt");

ALTER TABLE "product_import_audits"
ADD CONSTRAINT "product_import_audits_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_import_audits"
ADD CONSTRAINT "product_import_audits_locationId_fkey"
FOREIGN KEY ("tenantId", "locationId") REFERENCES "locations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_import_audits"
ADD CONSTRAINT "product_import_audits_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
