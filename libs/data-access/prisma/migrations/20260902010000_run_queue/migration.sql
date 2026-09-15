-- AlterTable
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "lockedBy" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Run_status_createdAt_idx" ON "Run"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Run_workflowId_status_idx" ON "Run"("workflowId", "status");
