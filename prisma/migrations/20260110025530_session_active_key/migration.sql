-- AlterTable
ALTER TABLE "Session" ADD COLUMN "activeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_activeKey_key" ON "Session"("activeKey");

