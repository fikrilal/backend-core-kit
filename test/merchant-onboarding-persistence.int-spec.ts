import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../libs/platform/db/prisma.service';
import { createConfigService } from './support/stubs';
import { PrismaMerchantOnboardingRepository } from '../libs/features/merchant-onboarding/prisma-merchant-onboarding.repository';
import { validateMerchantOnboardingApplication } from '../libs/features/merchant-onboarding/merchant-onboarding.policy';
import type {
  MerchantOnboardingApplicationInput,
  ValidatedMerchantOnboardingApplication,
} from '../libs/features/merchant-onboarding/merchant-onboarding.model';

const RAW_ACCOUNT_NUMBER = '0012345678';
const OWNER_ROW_ID = 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8';
const OWNER_ROW_ID_B = 'b4591876-9c0c-4f8d-9df5-8fdd11ef13d8';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

function uniqueRegistrationNumber(): string {
  return `REG-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function buildApplicationInput(): MerchantOnboardingApplicationInput {
  return {
    business: {
      legalName: 'Acme Studio',
      businessTypeId: 'private_company',
      registrationNumber: uniqueRegistrationNumber(),
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
        ownershipBasisPoints: 6000,
        email: 'ari@example.com',
        isPrimaryContact: true,
      },
      {
        ownerRowId: OWNER_ROW_ID_B,
        fullName: 'Bella Example',
        roleId: 'owner',
        ownershipBasisPoints: 4000,
        email: 'bella@example.com',
        isPrimaryContact: false,
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

function validatedApplication(): ValidatedMerchantOnboardingApplication {
  const outcome = validateMerchantOnboardingApplication(buildApplicationInput());
  if (outcome.kind !== 'valid') {
    throw new Error(
      `Expected a valid application input, got: ${outcome.issues.map((i) => i.code).join(', ')}`,
    );
  }
  return outcome.application;
}

(shouldSkip ? describe.skip : describe)('Merchant onboarding persistence (int)', () => {
  let prisma: PrismaService;
  let repo: PrismaMerchantOnboardingRepository;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(
      createConfigService({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }),
    );
    await prisma.ping();
    repo = new PrismaMerchantOnboardingRepository(prisma);
  });

  afterEach(async () => {
    const client = prisma.getClient();
    while (createdUserIds.length) {
      const userId = createdUserIds.pop();
      if (!userId) continue;
      await client.user.deleteMany({ where: { id: userId } });
    }
  });

  async function createUser(): Promise<string> {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: {
        email: `merchant-int-${Date.now()}-${randomUUID()}@example.com`,
        role: UserRole.USER,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it('creates the application and owners atomically with normalized data', async () => {
    const userId = await createUser();
    const submittedAt = new Date('2026-08-30T10:00:00.000Z');

    const result = await repo.createApplication({
      userId,
      application: validatedApplication(),
      submittedAt,
    });

    if (result.kind !== 'created') {
      throw new Error(`Expected created result, got: ${result.kind}`);
    }

    const client = prisma.getClient();
    const application = await client.merchantApplication.findUnique({
      where: { id: result.application.id },
      include: { owners: true },
    });
    if (!application) {
      throw new Error('Expected the stored application row');
    }

    expect(application.userId).toBe(userId);
    expect(application.legalName).toBe('Acme Studio');
    expect(application.contactEmail).toBe('owner@example.com');
    expect(application.contactPhone).toBe('+6281234567890');
    expect(application.accountNumberLast4).toBe('5678');
    expect(application.termsVersion).toBe('2026-08-30');
    expect(application.submittedAt.toISOString()).toBe('2026-08-30T10:00:00.000Z');
    expect(application.owners).toHaveLength(2);
    expect(
      application.owners.map((owner) => ({
        clientRowId: owner.clientRowId,
        email: owner.email,
        ownershipBasisPoints: owner.ownershipBasisPoints,
      })),
    ).toEqual(
      expect.arrayContaining([
        { clientRowId: OWNER_ROW_ID, email: 'ari@example.com', ownershipBasisPoints: 6000 },
        { clientRowId: OWNER_ROW_ID_B, email: 'bella@example.com', ownershipBasisPoints: 4000 },
      ]),
    );

    expect(JSON.stringify(application)).not.toContain(RAW_ACCOUNT_NUMBER);
  });

  it('enforces one application per user through the unique constraint', async () => {
    const userId = await createUser();
    const first = await repo.createApplication({
      userId,
      application: validatedApplication(),
      submittedAt: new Date('2026-08-30T10:00:00.000Z'),
    });
    if (first.kind !== 'created') {
      throw new Error(`Expected created result, got: ${first.kind}`);
    }

    const second = await repo.createApplication({
      userId,
      application: validatedApplication(),
      submittedAt: new Date('2026-08-30T10:01:00.000Z'),
    });

    expect(second).toEqual({ kind: 'user_already_exists' });

    const client = prisma.getClient();
    const count = await client.merchantApplication.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it('maps a duplicate registration number to registration_already_exists', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const sharedRegistrationNumber = uniqueRegistrationNumber();
    const applicationA = validatedApplication();
    const applicationB = validatedApplication();

    const first = await repo.createApplication({
      userId: userA,
      application: {
        ...applicationA,
        business: { ...applicationA.business, registrationNumber: sharedRegistrationNumber },
      },
      submittedAt: new Date('2026-08-30T10:00:00.000Z'),
    });
    if (first.kind !== 'created') {
      throw new Error(`Expected created result, got: ${first.kind}`);
    }

    const second = await repo.createApplication({
      userId: userB,
      application: {
        ...applicationB,
        business: { ...applicationB.business, registrationNumber: sharedRegistrationNumber },
      },
      submittedAt: new Date('2026-08-30T10:01:00.000Z'),
    });

    expect(second).toEqual({ kind: 'registration_already_exists' });

    const client = prisma.getClient();
    const count = await client.merchantApplication.count({
      where: { registrationNumber: sharedRegistrationNumber },
    });
    expect(count).toBe(1);
  });

  it('rolls back all rows when the owner batch fails the unique constraint', async () => {
    const userId = await createUser();
    const application = validatedApplication();
    const duplicatedOwner = application.owners[0];
    if (!duplicatedOwner) {
      throw new Error('Expected a validated owner row');
    }

    await expect(
      repo.createApplication({
        userId,
        application: {
          ...application,
          owners: [...application.owners, { ...duplicatedOwner }],
        },
        submittedAt: new Date('2026-08-30T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(Error);

    const client = prisma.getClient();
    const applicationCount = await client.merchantApplication.count({ where: { userId } });
    expect(applicationCount).toBe(0);

    const ownerRows = await client.merchantOwner.findMany({
      where: { clientRowId: OWNER_ROW_ID },
    });
    expect(ownerRows).toHaveLength(0);
  });
});
