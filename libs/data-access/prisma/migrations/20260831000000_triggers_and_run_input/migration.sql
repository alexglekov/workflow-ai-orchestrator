-- AlterTable
ALTER TABLE "WorkflowStep" ADD COLUMN "iterate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Run" ADD COLUMN "triggerId" TEXT;
ALTER TABLE "Run" ADD COLUMN "input" JSONB;

-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "token" TEXT,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trigger_token_key" ON "Trigger"("token");

-- CreateIndex
CREATE INDEX "Trigger_workflowId_idx" ON "Trigger"("workflowId");

-- CreateIndex
CREATE INDEX "Trigger_enabled_type_idx" ON "Trigger"("enabled", "type");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
