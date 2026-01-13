-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('PROFILE_IMAGE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'ACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "profileImageFileId" UUID;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerUserId" UUID NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_profileImageFileId_key" ON "UserProfile"("profileImageFileId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_bucket_objectKey_key" ON "StoredFile"("bucket", "objectKey");

-- CreateIndex
CREATE INDEX "StoredFile_ownerUserId_createdAt_idx" ON "StoredFile"("ownerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_profileImageFileId_fkey" FOREIGN KEY ("profileImageFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

