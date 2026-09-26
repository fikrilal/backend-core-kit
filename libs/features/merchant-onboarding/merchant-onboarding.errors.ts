export { MerchantOnboardingErrorCode } from '../../shared/merchant-onboarding/merchant-onboarding-error-codes';
import { MerchantOnboardingErrorCode } from '../../shared/merchant-onboarding/merchant-onboarding-error-codes';
import { ErrorCode } from '../../shared/error-codes';
import type { MerchantOnboardingPolicyIssue } from './merchant-onboarding.model';

export type MerchantOnboardingIssue = Readonly<{ field?: string; message: string }>;

export type MerchantOnboardingErrorCodeValue = MerchantOnboardingErrorCode | ErrorCode;

export class MerchantOnboardingError extends Error {
  readonly status: number;
  readonly code: MerchantOnboardingErrorCodeValue;
  readonly issues?: ReadonlyArray<MerchantOnboardingIssue>;

  constructor(params: {
    status: number;
    code: MerchantOnboardingErrorCodeValue;
    message?: string;
    issues?: ReadonlyArray<MerchantOnboardingIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}

export function merchantOnboardingIssuesToError(
  issues: ReadonlyArray<MerchantOnboardingPolicyIssue>,
): MerchantOnboardingError {
  const referenceDataIssues = issues.filter((issue) => issue.category === 'reference_data');
  if (referenceDataIssues.length > 0) {
    return new MerchantOnboardingError({
      status: 409,
      code: MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REFERENCE_DATA_STALE,
      message: 'Reference data changed; reload reference data and resubmit',
      issues: referenceDataIssues.map((issue) => ({ field: issue.path, message: issue.code })),
    });
  }

  const termsIssues = issues.filter((issue) => issue.category === 'terms');
  if (termsIssues.length > 0) {
    return new MerchantOnboardingError({
      status: 409,
      code: MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_TERMS_VERSION_STALE,
      message: 'Terms version is no longer current; reload reference data and accept again',
      issues: termsIssues.map((issue) => ({ field: issue.path, message: issue.code })),
    });
  }

  return new MerchantOnboardingError({
    status: 400,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'One or more fields are invalid',
    issues: issues.map((issue) => ({ field: issue.path, message: issue.code })),
  });
}
