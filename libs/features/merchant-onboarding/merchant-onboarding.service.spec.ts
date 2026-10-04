import type { Clock } from '../../shared/time';
import type {
  MerchantOnboardingApplicationInput,
  MerchantOnboardingSubmitView,
  ValidatedMerchantOnboardingApplication,
} from './merchant-onboarding.model';
import type {
  CreateMerchantApplicationParams,
  CreateMerchantApplicationResult,
  MerchantOnboardingRepository,
} from './merchant-onboarding.repository';
import { MerchantOnboardingErrorCode } from './merchant-onboarding.errors';
import { MerchantOnboardingError } from './merchant-onboarding.errors';
import { MerchantOnboardingService } from './merchant-onboarding.service';
import { validateMerchantOnboardingApplication } from './merchant-onboarding.policy';

const USER_ID = '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0';
const RAW_ACCOUNT_NUMBER = '0012345678';
const FIXED_NOW = new Date('2026-08-30T10:00:00.000Z');

class FakeMerchantOnboardingRepository implements MerchantOnboardingRepository {
  readonly calls: CreateMerchantApplicationParams[] = [];
  private readonly result: CreateMerchantApplicationResult;

  constructor(result: CreateMerchantApplicationResult) {
    this.result = result;
  }

  async createApplication(
    params: CreateMerchantApplicationParams,
  ): Promise<CreateMerchantApplicationResult> {
    this.calls.push(params);
    return this.result;
  }
}

const fakeClock: Clock = { now: () => FIXED_NOW };

function buildValidApplicationInput(): MerchantOnboardingApplicationInput {
  return {
    business: {
      legalName: 'Acme Studio',
      businessTypeId: 'private_company',
      registrationNumber: 'REG-12345',
      industryId: 'digital_services',
      monthlySalesRangeId: '10m_to_50m_idr',
      contactEmail: 'owner@example.com',
      contactPhone: '+6281234567890',
    },
    owners: [
      {
        ownerRowId: 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8',
        fullName: 'Ari Example',
        roleId: 'owner',
        ownershipBasisPoints: 10000,
        email: 'owner@example.com',
        isPrimaryContact: true,
      },
    ],
    settlement: {
      bankId: 'demo_bank_alpha',
      accountHolderName: 'Ari Example',
      accountNumber: RAW_ACCOUNT_NUMBER,
      holderTypeId: 'owner',
      ownerRowId: 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8',
      payoutScheduleId: 'weekly',
    },
    declarations: {
      informationAccurate: true,
      authorizedToSubmit: true,
      termsAccepted: true,
      termsVersion: '2026-08-30',
    },
  };
}

function expectMerchantError(err: unknown): MerchantOnboardingError {
  if (!(err instanceof MerchantOnboardingError)) {
    throw new Error(`Expected MerchantOnboardingError, got: String(err)`);
  }
  return err;
}

async function submitWith(
  repository: FakeMerchantOnboardingRepository,
  input: MerchantOnboardingApplicationInput,
): Promise<MerchantOnboardingSubmitView> {
  const service = new MerchantOnboardingService(repository, fakeClock);
  return await service.submitApplication({ userId: USER_ID, request: input });
}

describe('MerchantOnboardingService (unit)', () => {
  it('returns the reference-data view', () => {
    const service = new MerchantOnboardingService(
      new FakeMerchantOnboardingRepository({ kind: 'user_already_exists' }),
      fakeClock,
    );

    const view = service.getReferenceData();

    expect(view.termsVersion).toBe('2026-08-30');
    expect(view.businessTypes).toHaveLength(2);
    expect(view.banks[0]?.supportedPayoutScheduleIds).toEqual(['daily', 'weekly']);
  });

  it('rejects invalid input before calling the repository', async () => {
    const repository = new FakeMerchantOnboardingRepository({ kind: 'user_already_exists' });
    const input = buildValidApplicationInput();

    let caught: unknown;
    try {
      await submitWith(repository, {
        ...input,
        business: { ...input.business, legalName: '   ' },
      });
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.issues).toEqual([
      { field: 'business.legalName', message: 'business.legal_name.required' },
    ]);
    expect(repository.calls).toHaveLength(0);
  });

  it('maps stale reference data to a 409 feature error with the selected paths', async () => {
    const repository = new FakeMerchantOnboardingRepository({ kind: 'user_already_exists' });
    const input = buildValidApplicationInput();

    let caught: unknown;
    try {
      await submitWith(repository, {
        ...input,
        business: { ...input.business, businessTypeId: 'unknown_type' },
      });
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(409);
    expect(error.code).toBe(MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REFERENCE_DATA_STALE);
    expect(error.issues).toEqual([
      { field: 'business.businessTypeId', message: 'business.type.unsupported' },
    ]);
    expect(repository.calls).toHaveLength(0);
  });

  it('maps a stale terms version to a 409 feature error', async () => {
    const repository = new FakeMerchantOnboardingRepository({ kind: 'user_already_exists' });
    const input = buildValidApplicationInput();

    let caught: unknown;
    try {
      await submitWith(repository, {
        ...input,
        declarations: { ...input.declarations, termsVersion: '2026-07-01' },
      });
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(409);
    expect(error.code).toBe(MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_TERMS_VERSION_STALE);
    expect(error.issues).toEqual([
      { field: 'declarations.termsVersion', message: 'declarations.terms_version.stale' },
    ]);
    expect(repository.calls).toHaveLength(0);
  });

  it('creates the application once with clock time and returns the safe submit view', async () => {
    const repository = new FakeMerchantOnboardingRepository({
      kind: 'created',
      application: {
        id: 'app-1',
        userId: USER_ID,
        legalName: 'Acme Studio',
        businessTypeId: 'private_company',
        registrationNumber: 'REG-12345',
        industryId: 'digital_services',
        monthlySalesRangeId: '10m_to_50m_idr',
        contactEmail: 'owner@example.com',
        contactPhone: '+6281234567890',
        settlementBankId: 'demo_bank_alpha',
        accountHolderName: 'Ari Example',
        settlementHolderTypeId: 'owner',
        settlementOwnerRowId: 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8',
        accountNumberLast4: '5678',
        payoutScheduleId: 'weekly',
        termsVersion: '2026-08-30',
        submittedAt: FIXED_NOW,
      },
    });
    const input = buildValidApplicationInput();

    const view = await submitWith(repository, input);

    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.userId).toBe(USER_ID);
    expect(repository.calls[0]?.submittedAt).toBe(FIXED_NOW);

    const validated: ValidatedMerchantOnboardingApplication | undefined =
      repository.calls[0]?.application;
    expect(validated?.business.legalName).toBe('Acme Studio');

    expect(view).toEqual({
      applicationId: 'app-1',
      submittedAt: '2026-08-30T10:00:00.000Z',
      settlement: { bankId: 'demo_bank_alpha', accountNumberLast4: '5678' },
    });
    expect(JSON.stringify(view)).not.toContain(RAW_ACCOUNT_NUMBER);
  });

  it('maps an existing application for the user to a 409 feature error', async () => {
    const repository = new FakeMerchantOnboardingRepository({ kind: 'user_already_exists' });

    let caught: unknown;
    try {
      await submitWith(repository, buildValidApplicationInput());
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(409);
    expect(error.code).toBe(
      MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_APPLICATION_ALREADY_EXISTS,
    );
    expect(repository.calls).toHaveLength(1);
  });

  it('maps an existing registration to a 409 feature error with the field path', async () => {
    const repository = new FakeMerchantOnboardingRepository({
      kind: 'registration_already_exists',
    });

    let caught: unknown;
    try {
      await submitWith(repository, buildValidApplicationInput());
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(409);
    expect(error.code).toBe(
      MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REGISTRATION_ALREADY_EXISTS,
    );
    expect(error.issues).toEqual([
      { field: 'business.registrationNumber', message: 'business.registration_number.unavailable' },
    ]);
  });

  it('maps an invalid owner reference to a validation error on the settlement path', async () => {
    const repository = new FakeMerchantOnboardingRepository({ kind: 'invalid_owner_reference' });

    let caught: unknown;
    try {
      await submitWith(repository, buildValidApplicationInput());
    } catch (err: unknown) {
      caught = err;
    }

    const error = expectMerchantError(caught);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.issues).toEqual([
      { field: 'settlement.ownerRowId', message: 'settlement.owner.unknown' },
    ]);
  });

  it('keeps the policy as the only validation entry point', () => {
    const outcome = validateMerchantOnboardingApplication(buildValidApplicationInput());
    expect(outcome.kind).toBe('valid');
  });
});
