-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "UserStatusChangeAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "actorSessionId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "oldStatus" "UserStatus" NOT NULL,
    "newStatus" "UserStatus" NOT NULL,
    "reason" TEXT,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStatusChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserStatusChangeAudit_targetUserId_createdAt_idx" ON "UserStatusChangeAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserStatusChangeAudit_actorUserId_createdAt_idx" ON "UserStatusChangeAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserStatusChangeAudit_traceId_idx" ON "UserStatusChangeAudit"("traceId");
