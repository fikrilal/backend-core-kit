export interface MerchantBusinessTypeOption {
  readonly id: string;
  readonly label: string;
  readonly requiresRegistrationNumber: boolean;
}

export interface MerchantLabeledOption {
  readonly id: string;
  readonly label: string;
}

export interface MerchantOwnerRoleOption {
  readonly id: string;
  readonly label: string;
  readonly contributesOwnership: boolean;
}

export interface MerchantBankOption {
  readonly id: string;
  readonly label: string;
  readonly supportedPayoutScheduleIds: ReadonlyArray<string>;
}

export interface MerchantAccountHolderTypeOption {
  readonly id: string;
  readonly label: string;
  readonly requiresOwnerReference: boolean;
}

export const MERCHANT_BUSINESS_TYPES: ReadonlyArray<MerchantBusinessTypeOption> = [
  { id: 'sole_proprietorship', label: 'Sole proprietorship', requiresRegistrationNumber: false },
  { id: 'private_company', label: 'Private company', requiresRegistrationNumber: true },
];

export const MERCHANT_INDUSTRIES: ReadonlyArray<MerchantLabeledOption> = [
  { id: 'retail', label: 'Retail' },
  { id: 'food_beverage', label: 'Food and beverage' },
  { id: 'professional_services', label: 'Professional services' },
  { id: 'digital_services', label: 'Digital services' },
];

export const MERCHANT_MONTHLY_SALES_RANGES: ReadonlyArray<MerchantLabeledOption> = [
  { id: 'under_10m_idr', label: 'Under IDR 10 million' },
  { id: '10m_to_50m_idr', label: 'IDR 10 million to 50 million' },
  { id: '50m_to_250m_idr', label: 'IDR 50 million to 250 million' },
  { id: 'above_250m_idr', label: 'Above IDR 250 million' },
];

export const MERCHANT_OWNER_ROLES: ReadonlyArray<MerchantOwnerRoleOption> = [
  { id: 'owner', label: 'Owner', contributesOwnership: true },
  { id: 'director', label: 'Director', contributesOwnership: false },
];

export const MERCHANT_BANKS: ReadonlyArray<MerchantBankOption> = [
  {
    id: 'demo_bank_alpha',
    label: 'Demo Bank Alpha',
    supportedPayoutScheduleIds: ['daily', 'weekly'],
  },
  {
    id: 'demo_bank_beta',
    label: 'Demo Bank Beta',
    supportedPayoutScheduleIds: ['weekly'],
  },
];

export const MERCHANT_ACCOUNT_HOLDER_TYPES: ReadonlyArray<MerchantAccountHolderTypeOption> = [
  { id: 'business', label: 'Business', requiresOwnerReference: false },
  { id: 'owner', label: 'Owner', requiresOwnerReference: true },
];

export const MERCHANT_PAYOUT_SCHEDULES: ReadonlyArray<MerchantLabeledOption> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

export const MERCHANT_ONBOARDING_TERMS_VERSION = '2026-08-30';

export function findMerchantBusinessType(id: string): MerchantBusinessTypeOption | undefined {
  return MERCHANT_BUSINESS_TYPES.find((option) => option.id === id);
}

export function findMerchantIndustry(id: string): MerchantLabeledOption | undefined {
  return MERCHANT_INDUSTRIES.find((option) => option.id === id);
}

export function findMerchantMonthlySalesRange(id: string): MerchantLabeledOption | undefined {
  return MERCHANT_MONTHLY_SALES_RANGES.find((option) => option.id === id);
}

export function findMerchantOwnerRole(id: string): MerchantOwnerRoleOption | undefined {
  return MERCHANT_OWNER_ROLES.find((option) => option.id === id);
}

export function findMerchantBank(id: string): MerchantBankOption | undefined {
  return MERCHANT_BANKS.find((option) => option.id === id);
}

export function findMerchantAccountHolderType(
  id: string,
): MerchantAccountHolderTypeOption | undefined {
  return MERCHANT_ACCOUNT_HOLDER_TYPES.find((option) => option.id === id);
}

export function findMerchantPayoutSchedule(id: string): MerchantLabeledOption | undefined {
  return MERCHANT_PAYOUT_SCHEDULES.find((option) => option.id === id);
}

export type MerchantOnboardingReferenceDataView = Readonly<{
  businessTypes: Array<MerchantBusinessTypeOption>;
  industries: Array<MerchantLabeledOption>;
  monthlySalesRanges: Array<MerchantLabeledOption>;
  ownerRoles: Array<MerchantOwnerRoleOption>;
  banks: Array<MerchantBankOption>;
  accountHolderTypes: Array<MerchantAccountHolderTypeOption>;
  payoutSchedules: Array<MerchantLabeledOption>;
  termsVersion: string;
}>;

export function buildMerchantOnboardingReferenceDataView(): MerchantOnboardingReferenceDataView {
  return {
    businessTypes: [...MERCHANT_BUSINESS_TYPES],
    industries: [...MERCHANT_INDUSTRIES],
    monthlySalesRanges: [...MERCHANT_MONTHLY_SALES_RANGES],
    ownerRoles: [...MERCHANT_OWNER_ROLES],
    banks: MERCHANT_BANKS.map((bank) => ({
      id: bank.id,
      label: bank.label,
      supportedPayoutScheduleIds: [...bank.supportedPayoutScheduleIds],
    })),
    accountHolderTypes: [...MERCHANT_ACCOUNT_HOLDER_TYPES],
    payoutSchedules: [...MERCHANT_PAYOUT_SCHEDULES],
    termsVersion: MERCHANT_ONBOARDING_TERMS_VERSION,
  };
}
