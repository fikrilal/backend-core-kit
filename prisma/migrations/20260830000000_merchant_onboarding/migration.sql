-- CreateTable
CREATE TABLE "MerchantApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "businessTypeId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "industryId" TEXT NOT NULL,
    "monthlySalesRangeId" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "settlementBankId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "settlementHolderTypeId" TEXT NOT NULL,
    "settlementOwnerRowId" UUID,
    "accountNumberLast4" TEXT NOT NULL,
    "payoutScheduleId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantOwner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicationId" UUID NOT NULL,
    "clientRowId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "ownershipBasisPoints" INTEGER,
    "email" TEXT NOT NULL,
    "isPrimaryContact" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantApplication_userId_key" ON "MerchantApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantApplication_registrationNumber_key" ON "MerchantApplication"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantOwner_applicationId_clientRowId_key" ON "MerchantOwner"("applicationId", "clientRowId");

-- AddForeignKey
ALTER TABLE "MerchantApplication" ADD CONSTRAINT "MerchantApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOwner" ADD CONSTRAINT "MerchantOwner_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MerchantApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
