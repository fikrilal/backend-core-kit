import {
  MERCHANT_ACCOUNT_HOLDER_TYPES,
  MERCHANT_BANKS,
  MERCHANT_BUSINESS_TYPES,
  MERCHANT_INDUSTRIES,
  MERCHANT_MONTHLY_SALES_RANGES,
  MERCHANT_ONBOARDING_TERMS_VERSION,
  MERCHANT_OWNER_ROLES,
  MERCHANT_PAYOUT_SCHEDULES,
  buildMerchantOnboardingReferenceDataView,
  findMerchantAccountHolderType,
  findMerchantBank,
  findMerchantBusinessType,
  findMerchantIndustry,
  findMerchantMonthlySalesRange,
  findMerchantOwnerRole,
  findMerchantPayoutSchedule,
} from './merchant-onboarding.reference-data';

describe('merchant-onboarding reference data', () => {
  it('matches the handoff catalog IDs', () => {
    expect(MERCHANT_BUSINESS_TYPES.map((option) => option.id)).toEqual([
      'sole_proprietorship',
      'private_company',
    ]);
    expect(MERCHANT_INDUSTRIES.map((option) => option.id)).toEqual([
      'retail',
      'food_beverage',
      'professional_services',
      'digital_services',
    ]);
    expect(MERCHANT_MONTHLY_SALES_RANGES.map((option) => option.id)).toEqual([
      'under_10m_idr',
      '10m_to_50m_idr',
      '50m_to_250m_idr',
      'above_250m_idr',
    ]);
    expect(MERCHANT_OWNER_ROLES.map((option) => option.id)).toEqual(['owner', 'director']);
    expect(MERCHANT_BANKS.map((option) => option.id)).toEqual([
      'demo_bank_alpha',
      'demo_bank_beta',
    ]);
    expect(MERCHANT_ACCOUNT_HOLDER_TYPES.map((option) => option.id)).toEqual(['business', 'owner']);
    expect(MERCHANT_PAYOUT_SCHEDULES.map((option) => option.id)).toEqual(['daily', 'weekly']);
    expect(MERCHANT_ONBOARDING_TERMS_VERSION).toBe('2026-08-30');
  });

  it('declares the conditional metadata from the handoff', () => {
    expect(findMerchantBusinessType('sole_proprietorship')?.requiresRegistrationNumber).toBe(false);
    expect(findMerchantBusinessType('private_company')?.requiresRegistrationNumber).toBe(true);
    expect(findMerchantOwnerRole('owner')?.contributesOwnership).toBe(true);
    expect(findMerchantOwnerRole('director')?.contributesOwnership).toBe(false);
    expect(findMerchantAccountHolderType('business')?.requiresOwnerReference).toBe(false);
    expect(findMerchantAccountHolderType('owner')?.requiresOwnerReference).toBe(true);
    expect(findMerchantBank('demo_bank_alpha')?.supportedPayoutScheduleIds).toEqual([
      'daily',
      'weekly',
    ]);
    expect(findMerchantBank('demo_bank_beta')?.supportedPayoutScheduleIds).toEqual(['weekly']);
  });

  it('uses unique IDs within each catalog', () => {
    const catalogs = [
      MERCHANT_BUSINESS_TYPES,
      MERCHANT_INDUSTRIES,
      MERCHANT_MONTHLY_SALES_RANGES,
      MERCHANT_OWNER_ROLES,
      MERCHANT_BANKS,
      MERCHANT_ACCOUNT_HOLDER_TYPES,
      MERCHANT_PAYOUT_SCHEDULES,
    ];
    for (const catalog of catalogs) {
      const ids = catalog.map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('only references payout schedules that exist', () => {
    const scheduleIds = new Set(MERCHANT_PAYOUT_SCHEDULES.map((option) => option.id));
    for (const bank of MERCHANT_BANKS) {
      for (const scheduleId of bank.supportedPayoutScheduleIds) {
        expect(scheduleIds.has(scheduleId)).toBe(true);
      }
    }
  });

  it('builds the reference-data view with every option and the terms version', () => {
    const view = buildMerchantOnboardingReferenceDataView();

    expect(view.businessTypes).toEqual(MERCHANT_BUSINESS_TYPES);
    expect(view.industries).toEqual(MERCHANT_INDUSTRIES);
    expect(view.monthlySalesRanges).toEqual(MERCHANT_MONTHLY_SALES_RANGES);
    expect(view.ownerRoles).toEqual(MERCHANT_OWNER_ROLES);
    expect(view.accountHolderTypes).toEqual(MERCHANT_ACCOUNT_HOLDER_TYPES);
    expect(view.payoutSchedules).toEqual(MERCHANT_PAYOUT_SCHEDULES);
    expect(view.banks).toEqual([
      {
        id: 'demo_bank_alpha',
        label: 'Demo Bank Alpha',
        supportedPayoutScheduleIds: ['daily', 'weekly'],
      },
      { id: 'demo_bank_beta', label: 'Demo Bank Beta', supportedPayoutScheduleIds: ['weekly'] },
    ]);
    expect(view.termsVersion).toBe('2026-08-30');
  });

  it('returns undefined for unknown lookups', () => {
    expect(findMerchantBusinessType('unknown')).toBeUndefined();
    expect(findMerchantIndustry('unknown')).toBeUndefined();
    expect(findMerchantMonthlySalesRange('unknown')).toBeUndefined();
    expect(findMerchantOwnerRole('unknown')).toBeUndefined();
    expect(findMerchantBank('unknown')).toBeUndefined();
    expect(findMerchantAccountHolderType('unknown')).toBeUndefined();
    expect(findMerchantPayoutSchedule('unknown')).toBeUndefined();
  });
});
