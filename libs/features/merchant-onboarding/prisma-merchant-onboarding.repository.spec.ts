import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/db/prisma.service';
import { createPrototypeStub } from '../../../test/support/stubs';
import { PrismaMerchantOnboardingRepository } from './prisma-merchant-onboarding.repository';
import { validateMerchantOnboardingApplication } from './merchant-onboarding.policy';
import type {
  MerchantOnboardingApplicationInput,
  ValidatedMerchantOnboardingApplication,
} from './merchant-onboarding.model';

const RAW_ACCOUNT_NUMBER = '0012345678';
const SUBMITTED_AT = new Date('2026-08-30T10:00:00.000Z');
const USER_ID = '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0';
const OWNER_ROW_ID = 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8';

type MerchantApplicationCreateArgs = {
  data: {
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
    owners: {
      create: Array<{
        clientRowId: string;
        fullName: string;
        roleId: string;
        ownershipBasisPoints: number | null;
        email: string;
        isPrimaryContact: boolean;
      }>;
    };
  };
  select: { id: boolean };
};

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
        ownerRowId: OWNER_ROW_ID,
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
      ownerRowId: OWNER_ROW_ID,
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

function buildValidatedApplication(
  overrides: Partial<MerchantOnboardingApplicationInput> = {},
): ValidatedMerchantOnboardingApplication {
  const outcome = validateMerchantOnboardingApplication(
    overrides ? { ...buildValidApplicationInput(), ...overrides } : buildValidApplicationInput(),
  );
  if (outcome.kind !== 'valid') {
    throw new Error('Expected a valid application input');
  }
  return outcome.application;
}

function createPrismaStub(params: { createError?: unknown } = {}): {
  prisma: PrismaService;
  createCalls: MerchantApplicationCreateArgs[];
} {
  const createCalls: MerchantApplicationCreateArgs[] = [];
  const txClient = {
    merchantApplication: {
      create: async (args: MerchantApplicationCreateArgs) => {
        createCalls.push(args);
        if (params.createError !== undefined) throw params.createError;
        return { id: 'app-1' };
      },
    },
  };
  const client = {
    $transaction: async <T>(fn: (tx: typeof txClient) => Promise<T>): Promise<T> =>
      await fn(txClient),
  };
  const prisma = createPrototypeStub(PrismaService, { getClient: () => client });
  return { prisma, createCalls };
}

function p2002(target: ReadonlyArray<string> | string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('PrismaMerchantOnboardingRepository.createApplication (unit)', () => {
  it('creates the application and owners in one transaction and returns the record', async () => {
    const { prisma, createCalls } = createPrismaStub();
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    const result = await repo.createApplication({
      userId: USER_ID,
      application: buildValidatedApplication(),
      submittedAt: SUBMITTED_AT,
    });

    if (result.kind !== 'created') {
      throw new Error(`Expected created result, got: ${result.kind}`);
    }

    expect(createCalls).toHaveLength(1);
    expect(JSON.stringify(createCalls)).not.toContain(RAW_ACCOUNT_NUMBER);

    const args = createCalls[0];
    if (!args) {
      throw new Error('Expected one create call');
    }
    expect(args.data.userId).toBe(USER_ID);
    expect(args.data.legalName).toBe('Acme Studio');
    expect(args.data.businessTypeId).toBe('private_company');
    expect(args.data.registrationNumber).toBe('REG-12345');
    expect(args.data.contactEmail).toBe('owner@example.com');
    expect(args.data.settlementBankId).toBe('demo_bank_alpha');
    expect(args.data.accountNumberLast4).toBe('5678');
    expect(args.data.settlementOwnerRowId).toBe(OWNER_ROW_ID);
    expect(args.data.termsVersion).toBe('2026-08-30');
    expect(args.data.submittedAt).toBe(SUBMITTED_AT);
    expect(args.data.owners.create).toHaveLength(1);
    expect(args.data.owners.create[0]).toEqual({
      clientRowId: OWNER_ROW_ID,
      fullName: 'Ari Example',
      roleId: 'owner',
      ownershipBasisPoints: 10000,
      email: 'owner@example.com',
      isPrimaryContact: true,
    });
    expect(args.select).toEqual({ id: true });

    expect(result.application).toEqual({
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
      settlementOwnerRowId: OWNER_ROW_ID,
      accountNumberLast4: '5678',
      payoutScheduleId: 'weekly',
      termsVersion: '2026-08-30',
      submittedAt: SUBMITTED_AT,
    });
  });

  it('maps a userId unique violation to user_already_exists', async () => {
    const { prisma } = createPrismaStub({ createError: p2002(['userId']) });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    const result = await repo.createApplication({
      userId: USER_ID,
      application: buildValidatedApplication(),
      submittedAt: SUBMITTED_AT,
    });

    expect(result).toEqual({ kind: 'user_already_exists' });
  });

  it('maps a registrationNumber unique violation to registration_already_exists', async () => {
    const { prisma } = createPrismaStub({ createError: p2002(['registrationNumber']) });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    const result = await repo.createApplication({
      userId: USER_ID,
      application: buildValidatedApplication(),
      submittedAt: SUBMITTED_AT,
    });

    expect(result).toEqual({ kind: 'registration_already_exists' });
  });

  it('maps a driver-adapter shaped unique violation to user_already_exists', async () => {
    const driverAdapterError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          modelName: 'MerchantApplication',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              originalCode: '23505',
              kind: 'UniqueConstraintViolation',
              constraint: { fields: ['"userId"'] },
            },
          },
        },
      },
    );
    const { prisma } = createPrismaStub({ createError: driverAdapterError });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    const result = await repo.createApplication({
      userId: USER_ID,
      application: buildValidatedApplication(),
      submittedAt: SUBMITTED_AT,
    });

    expect(result).toEqual({ kind: 'user_already_exists' });
  });

  it('maps a driver-adapter registration violation to registration_already_exists', async () => {
    const driverAdapterError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          modelName: 'MerchantApplication',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              originalCode: '23505',
              kind: 'UniqueConstraintViolation',
              constraint: { fields: ['"registrationNumber"'] },
            },
          },
        },
      },
    );
    const { prisma } = createPrismaStub({ createError: driverAdapterError });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    const result = await repo.createApplication({
      userId: USER_ID,
      application: buildValidatedApplication(),
      submittedAt: SUBMITTED_AT,
    });

    expect(result).toEqual({ kind: 'registration_already_exists' });
  });

  it('rethrows unique violations that are not user/registration conflicts', async () => {
    const { prisma } = createPrismaStub({
      createError: p2002(['applicationId', 'clientRowId']),
    });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    await expect(
      repo.createApplication({
        userId: USER_ID,
        application: buildValidatedApplication(),
        submittedAt: SUBMITTED_AT,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('rethrows unexpected errors', async () => {
    const boom = new Error('boom');
    const { prisma } = createPrismaStub({ createError: boom });
    const repo = new PrismaMerchantOnboardingRepository(prisma);

    await expect(
      repo.createApplication({
        userId: USER_ID,
        application: buildValidatedApplication(),
        submittedAt: SUBMITTED_AT,
      }),
    ).rejects.toBe(boom);
  });

  it('rejects a settlement owner reference outside the owner batch without writing', async () => {
    const { prisma, createCalls } = createPrismaStub();
    const repo = new PrismaMerchantOnboardingRepository(prisma);
    const application = buildValidatedApplication();

    const result = await repo.createApplication({
      userId: USER_ID,
      application: {
        ...application,
        settlement: {
          ...application.settlement,
          ownerRowId: '99999999-9999-4999-8999-999999999999',
        },
      },
      submittedAt: SUBMITTED_AT,
    });

    expect(result).toEqual({ kind: 'invalid_owner_reference' });
    expect(createCalls).toHaveLength(0);
  });
});
