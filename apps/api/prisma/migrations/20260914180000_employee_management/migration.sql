-- Employee management foundation: tenant-safe assignments, one-time actions,
-- immutable audit records, and versioned sessions.
ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'INVITED' BEFORE 'ACTIVE';

CREATE TYPE "MembershipActionType" AS ENUM ('INVITE', 'PASSWORD_RESET');
CREATE TYPE "EmployeeAuditAction" AS ENUM (
  'INVITED',
  'ROLE_STATUS_ASSIGNMENTS_CHANGED',
  'PASSWORD_RESET_ISSUED',
  'SESSIONS_REVOKED'
);

ALTER TABLE "users"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "tenant_memberships"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "accessVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "tenant_memberships_tenantId_id_key"
  ON "tenant_memberships"("tenantId", "id");
CREATE UNIQUE INDEX "tenant_memberships_tenantId_userId_id_key"
  ON "tenant_memberships"("tenantId", "userId", "id");
CREATE UNIQUE INDEX "locations_tenantId_id_key"
  ON "locations"("tenantId", "id");

CREATE TABLE "membership_locations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_locations_membershipId_locationId_key"
  ON "membership_locations"("membershipId", "locationId");
CREATE INDEX "membership_locations_tenantId_locationId_idx"
  ON "membership_locations"("tenantId", "locationId");

ALTER TABLE "membership_locations"
  ADD CONSTRAINT "membership_locations_tenantId_membershipId_fkey"
  FOREIGN KEY ("tenantId", "membershipId")
  REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "membership_locations_tenantId_locationId_fkey"
  FOREIGN KEY ("tenantId", "locationId")
  REFERENCES "locations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing active memberships keep current behavior after rollout. Owners do not
-- require assignments at runtime, but backfilling all active memberships makes
-- the migration deterministic and safe if a role changes later.
INSERT INTO "membership_locations" ("id", "tenantId", "membershipId", "locationId")
SELECT
  'ml_' || md5(m."id" || ':' || l."id"),
  m."tenantId",
  m."id",
  l."id"
FROM "tenant_memberships" m
JOIN "locations" l ON l."tenantId" = m."tenantId" AND l."isActive" = true
WHERE m."status" = 'ACTIVE'
ON CONFLICT ("membershipId", "locationId") DO NOTHING;

ALTER TABLE "sessions"
  ADD COLUMN "membershipId" TEXT,
  ADD COLUMN "credentialVersion" INTEGER,
  ADD COLUMN "membershipAccessVersion" INTEGER;

UPDATE "sessions" s
SET
  "membershipId" = m."id",
  "credentialVersion" = u."credentialVersion",
  "membershipAccessVersion" = m."accessVersion"
FROM "tenant_memberships" m, "users" u
WHERE m."tenantId" = s."tenantId"
  AND m."userId" = s."userId"
  AND u."id" = s."userId";

-- Fail migration rather than silently preserving an unscoped legacy session.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sessions"
    WHERE "membershipId" IS NULL
       OR "credentialVersion" IS NULL
       OR "membershipAccessVersion" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill tenant membership for every existing session';
  END IF;
END $$;

ALTER TABLE "sessions"
  ALTER COLUMN "membershipId" SET NOT NULL,
  ALTER COLUMN "credentialVersion" SET NOT NULL,
  ALTER COLUMN "membershipAccessVersion" SET NOT NULL;

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_locationId_fkey";
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_tenantId_userId_membershipId_fkey"
  FOREIGN KEY ("tenantId", "userId", "membershipId")
  REFERENCES "tenant_memberships"("tenantId", "userId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sessions_tenantId_locationId_fkey"
  FOREIGN KEY ("tenantId", "locationId")
  REFERENCES "locations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sessions_tenantId_membershipId_idx"
  ON "sessions"("tenantId", "membershipId");

CREATE TABLE "membership_action_tokens" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "type" "MembershipActionType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_action_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "membership_action_tokens_tokenHash_key"
  ON "membership_action_tokens"("tokenHash");
CREATE INDEX "membership_action_tokens_tenantId_membershipId_type_expiresAt_idx"
  ON "membership_action_tokens"("tenantId", "membershipId", "type", "expiresAt");
CREATE INDEX "membership_action_tokens_userId_type_idx"
  ON "membership_action_tokens"("userId", "type");
ALTER TABLE "membership_action_tokens"
  ADD CONSTRAINT "membership_action_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "membership_action_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "membership_action_tokens_tenantId_userId_membershipId_fkey"
  FOREIGN KEY ("tenantId", "userId", "membershipId")
  REFERENCES "tenant_memberships"("tenantId", "userId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "membership_action_tokens_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "employee_audit_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetMembershipId" TEXT NOT NULL,
  "action" "EmployeeAuditAction" NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_audit_events_tenantId_createdAt_id_idx"
  ON "employee_audit_events"("tenantId", "createdAt", "id");
CREATE INDEX "employee_audit_events_targetMembershipId_idx"
  ON "employee_audit_events"("targetMembershipId");
ALTER TABLE "employee_audit_events"
  ADD CONSTRAINT "employee_audit_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_audit_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_audit_events_tenantId_targetMembershipId_fkey"
  FOREIGN KEY ("tenantId", "targetMembershipId")
  REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_employee_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'employee audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "employee_audit_events_immutable"
BEFORE UPDATE OR DELETE ON "employee_audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_employee_audit_mutation();
