-- CreateEnum
CREATE TYPE "UserAccountDeletionAction" AS ENUM ('REQUESTED', 'CANCELED', 'FINALIZED', 'FINALIZE_BLOCKED_LAST_ADMIN');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedSessionId" UUID,
ADD COLUMN     "deletionRequestedTraceId" TEXT,
ADD COLUMN     "deletionScheduledFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserAccountDeletionAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "actorSessionId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "action" "UserAccountDeletionAction" NOT NULL,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccountDeletionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAccountDeletionAudit_targetUserId_createdAt_idx" ON "UserAccountDeletionAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserAccountDeletionAudit_actorUserId_createdAt_idx" ON "UserAccountDeletionAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserAccountDeletionAudit_traceId_idx" ON "UserAccountDeletionAudit"("traceId");

-- CreateIndex
CREATE INDEX "User_deletionScheduledFor_idx" ON "User"("deletionScheduledFor");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
