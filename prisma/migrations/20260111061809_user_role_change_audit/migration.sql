-- CreateTable
CREATE TABLE "UserRoleChangeAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "actorSessionId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "oldRole" "UserRole" NOT NULL,
    "newRole" "UserRole" NOT NULL,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_targetUserId_createdAt_idx" ON "UserRoleChangeAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_actorUserId_createdAt_idx" ON "UserRoleChangeAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_traceId_idx" ON "UserRoleChangeAudit"("traceId");
