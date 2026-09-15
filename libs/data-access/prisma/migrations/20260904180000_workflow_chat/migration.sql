-- CreateTable
CREATE TABLE "WorkflowChatMessage" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "thread" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowChatMessage_workflowId_thread_createdAt_idx" ON "WorkflowChatMessage"("workflowId", "thread", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowChatMessage" ADD CONSTRAINT "WorkflowChatMessage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
