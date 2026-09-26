import type { ValidatedMerchantOnboardingApplication } from './merchant-onboarding.model';

export type MerchantApplicationRecord = Readonly<{
  id: string;
  userId: string;
  legalName: string;
  businessTypeId: string;
  registrationNumber: string | null;
  industryId: string;
  monthlySalesRangeId: string;
  contactEmail: string;
  contactPhone: string;
  settlementBankId: string;
  accountHolderName: string;
  settlementHolderTypeId: string;
  settlementOwnerRowId: string | null;
  accountNumberLast4: string;
  payoutScheduleId: string;
  termsVersion: string;
  submittedAt: Date;
}>;

export type CreateMerchantApplicationParams = Readonly<{
  userId: string;
  application: ValidatedMerchantOnboardingApplication;
  submittedAt: Date;
}>;

export type CreateMerchantApplicationResult =
  | Readonly<{ kind: 'created'; application: MerchantApplicationRecord }>
  | Readonly<{ kind: 'user_already_exists' }>
  | Readonly<{ kind: 'registration_already_exists' }>
  | Readonly<{ kind: 'invalid_owner_reference' }>;

export interface MerchantOnboardingRepository {
  createApplication(
    params: CreateMerchantApplicationParams,
  ): Promise<CreateMerchantApplicationResult>;
}
