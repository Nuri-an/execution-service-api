CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'DIAGNOSING', 'REPAIRING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "executions" (
  "id" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "diagnosis" TEXT,
  "repairNotes" TEXT,
  "assignedTo" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "executions_serviceOrderId_key" ON "executions"("serviceOrderId");
CREATE INDEX "executions_status_priority_createdAt_idx" ON "executions"("status", "priority", "createdAt");
