-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "pushPlatform" "PushPlatform",
ADD COLUMN     "pushToken" VARCHAR(2048),
ADD COLUMN     "pushTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN     "pushTokenUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Session_pushToken_key" ON "Session"("pushToken");

-- CreateIndex
CREATE INDEX "Session_pushTokenRevokedAt_idx" ON "Session"("pushTokenRevokedAt");
