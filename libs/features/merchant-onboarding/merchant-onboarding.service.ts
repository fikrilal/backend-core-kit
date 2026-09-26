import type { Clock } from '../../shared/time';
import type {
  MerchantOnboardingApplicationInput,
  MerchantOnboardingSubmitView,
} from './merchant-onboarding.model';
import type {
  MerchantApplicationRecord,
  MerchantOnboardingRepository,
} from './merchant-onboarding.repository';
import { validateMerchantOnboardingApplication } from './merchant-onboarding.policy';
import {
  MerchantOnboardingError,
  MerchantOnboardingErrorCode,
  merchantOnboardingIssuesToError,
} from './merchant-onboarding.errors';
import {
  buildMerchantOnboardingReferenceDataView,
  type MerchantOnboardingReferenceDataView,
} from './merchant-onboarding.reference-data';

export type SubmitMerchantOnboardingApplicationParams = Readonly<{
  userId: string;
  request: MerchantOnboardingApplicationInput;
}>;

export class MerchantOnboardingService {
  constructor(
    private readonly repository: MerchantOnboardingRepository,
    private readonly clock: Clock,
  ) {}

  getReferenceData(): MerchantOnboardingReferenceDataView {
    return buildMerchantOnboardingReferenceDataView();
  }

  async submitApplication(
    params: SubmitMerchantOnboardingApplicationParams,
  ): Promise<MerchantOnboardingSubmitView> {
    const outcome = validateMerchantOnboardingApplication(params.request);
    if (outcome.kind === 'invalid') {
      throw merchantOnboardingIssuesToError(outcome.issues);
    }

    const created = await this.repository.createApplication({
      userId: params.userId,
      application: outcome.application,
      submittedAt: this.clock.now(),
    });

    if (created.kind === 'user_already_exists') {
      throw new MerchantOnboardingError({
        status: 409,
        code: MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_APPLICATION_ALREADY_EXISTS,
        message: 'An application already exists for this user',
      });
    }
    if (created.kind === 'registration_already_exists') {
      throw new MerchantOnboardingError({
        status: 409,
        code: MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REGISTRATION_ALREADY_EXISTS,
        message: 'Registration number is already used',
        issues: [
          {
            field: 'business.registrationNumber',
            message: 'business.registration_number.unavailable',
          },
        ],
      });
    }
    if (created.kind === 'invalid_owner_reference') {
      throw merchantOnboardingIssuesToError([
        {
          category: 'field',
          code: 'settlement.owner.unknown',
          path: 'settlement.ownerRowId',
          message: 'Referenced owner does not exist',
        },
      ]);
    }

    return toSubmitView(created.application);
  }
}

function toSubmitView(application: MerchantApplicationRecord): MerchantOnboardingSubmitView {
  return {
    applicationId: application.id,
    submittedAt: application.submittedAt.toISOString(),
    settlement: {
      bankId: application.settlementBankId,
      accountNumberLast4: application.accountNumberLast4,
    },
  };
}
