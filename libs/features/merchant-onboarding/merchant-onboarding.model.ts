export type MerchantOnboardingIssueCategory = 'field' | 'reference_data' | 'terms';

export type MerchantOnboardingPolicyIssue = Readonly<{
  category: MerchantOnboardingIssueCategory;
  code: string;
  path: string;
  message: string;
}>;

export interface MerchantOnboardingBusinessInput {
  readonly legalName: string;
  readonly businessTypeId: string;
  readonly registrationNumber: string | null;
  readonly industryId: string;
  readonly monthlySalesRangeId: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
}

export interface MerchantOnboardingOwnerInput {
  readonly ownerRowId: string;
  readonly fullName: string;
  readonly roleId: string;
  readonly ownershipBasisPoints: number | null;
  readonly email: string;
  readonly isPrimaryContact: boolean;
}

export interface MerchantOnboardingSettlementInput {
  readonly bankId: string;
  readonly accountHolderName: string;
  readonly accountNumber: string;
  readonly holderTypeId: string;
  readonly ownerRowId: string | null;
  readonly payoutScheduleId: string;
}

export interface MerchantOnboardingDeclarationsInput {
  readonly informationAccurate: boolean;
  readonly authorizedToSubmit: boolean;
  readonly termsAccepted: boolean;
  readonly termsVersion: string;
}

export interface MerchantOnboardingApplicationInput {
  readonly business: MerchantOnboardingBusinessInput;
  readonly owners: ReadonlyArray<MerchantOnboardingOwnerInput>;
  readonly settlement: MerchantOnboardingSettlementInput;
  readonly declarations: MerchantOnboardingDeclarationsInput;
}

export type ValidatedMerchantOnboardingOwner = Readonly<{
  ownerRowId: string;
  fullName: string;
  roleId: string;
  ownershipBasisPoints: number | null;
  email: string;
  isPrimaryContact: boolean;
}>;

export type ValidatedMerchantOnboardingApplication = Readonly<{
  business: Readonly<{
    legalName: string;
    businessTypeId: string;
    registrationNumber: string | null;
    industryId: string;
    monthlySalesRangeId: string;
    contactEmail: string;
    contactPhone: string;
  }>;
  owners: ReadonlyArray<ValidatedMerchantOnboardingOwner>;
  settlement: Readonly<{
    bankId: string;
    accountHolderName: string;
    accountNumberLast4: string;
    holderTypeId: string;
    ownerRowId: string | null;
    payoutScheduleId: string;
  }>;
  termsVersion: string;
}>;

export type MerchantOnboardingSubmitView = Readonly<{
  applicationId: string;
  submittedAt: string;
  settlement: Readonly<{
    bankId: string;
    accountNumberLast4: string;
  }>;
}>;
