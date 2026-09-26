import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeMerchantOnboardingE2eSuite,
  getBodyData,
  getStringField,
  isObject,
  uniqueEmail,
} from './merchant-onboarding.e2e.harness';

const RAW_ACCOUNT_NUMBER = '0012345678';
const PASSWORD = 'correct-horse-battery-staple';

interface MerchantApplicationPayload {
  business: {
    legalName: string;
    businessTypeId: string;
    registrationNumber: string;
    industryId: string;
    monthlySalesRangeId: string;
    contactEmail: string;
    contactPhone: string;
  };
  owners: Array<{
    ownerRowId: string;
    fullName: string;
    roleId: string;
    ownershipBasisPoints: number;
    email: string;
    isPrimaryContact: boolean;
  }>;
  settlement: {
    bankId: string;
    accountHolderName: string;
    accountNumber: string;
    holderTypeId: string;
    ownerRowId: string;
    payoutScheduleId: string;
  };
  declarations: {
    informationAccurate: boolean;
    authorizedToSubmit: boolean;
    termsAccepted: boolean;
    termsVersion: string;
  };
}

interface MerchantApplicationPayloadOverrides {
  registrationNumber?: string;
  accountNumber?: string;
  businessTypeId?: string;
  payoutScheduleId?: string;
  bankId?: string;
  ownerRowId?: string;
}

function uniqueRegistrationNumber(): string {
  return `REG-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function buildApplicationPayload(
  overrides: MerchantApplicationPayloadOverrides = {},
): MerchantApplicationPayload {
  const ownerRowId = overrides.ownerRowId ?? 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8';
  return {
    business: {
      legalName: 'Acme Studio',
      businessTypeId: overrides.businessTypeId ?? 'private_company',
      registrationNumber: overrides.registrationNumber ?? uniqueRegistrationNumber(),
      industryId: 'digital_services',
      monthlySalesRangeId: '10m_to_50m_idr',
      contactEmail: 'owner@example.com',
      contactPhone: '+6281234567890',
    },
    owners: [
      {
        ownerRowId,
        fullName: 'Ari Example',
        roleId: 'owner',
        ownershipBasisPoints: 10000,
        email: 'owner@example.com',
        isPrimaryContact: true,
      },
    ],
    settlement: {
      bankId: overrides.bankId ?? 'demo_bank_alpha',
      accountHolderName: 'Ari Example',
      accountNumber: overrides.accountNumber ?? RAW_ACCOUNT_NUMBER,
      holderTypeId: 'owner',
      ownerRowId,
      payoutScheduleId: overrides.payoutScheduleId ?? 'weekly',
    },
    declarations: {
      informationAccurate: true,
      authorizedToSubmit: true,
      termsAccepted: true,
      termsVersion: '2026-08-30',
    },
  };
}

async function registerUser(baseUrl: string): Promise<{ accessToken: string; userId: string }> {
  const email = uniqueEmail('merchant');
  const registerRes = await request(baseUrl)
    .post('/v1/auth/password/register')
    .send({ email, password: PASSWORD })
    .expect(200);

  const data = getBodyData(registerRes.body);
  const user = data.user;
  if (!isObject(user)) {
    throw new Error('Expected register response user object');
  }
  return {
    accessToken: getStringField(data, 'accessToken'),
    userId: getStringField(user, 'id'),
  };
}

describeMerchantOnboardingE2eSuite('Merchant Onboarding (e2e)', (harness) => {
  let baseUrl = '';
  let prisma: ReturnType<typeof harness.prisma>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
  });

  it('GET /v1/merchant-onboarding/reference-data requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/merchant-onboarding/reference-data').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('POST /v1/merchant-onboarding/applications requires an access token', async () => {
    const res = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .send(buildApplicationPayload())
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('GET /v1/merchant-onboarding/reference-data returns the full catalog snapshot', async () => {
    const { accessToken } = await registerUser(baseUrl);

    const res = await request(baseUrl)
      .get('/v1/merchant-onboarding/reference-data')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toEqual({
      businessTypes: [
        {
          id: 'sole_proprietorship',
          label: 'Sole proprietorship',
          requiresRegistrationNumber: false,
        },
        { id: 'private_company', label: 'Private company', requiresRegistrationNumber: true },
      ],
      industries: [
        { id: 'retail', label: 'Retail' },
        { id: 'food_beverage', label: 'Food and beverage' },
        { id: 'professional_services', label: 'Professional services' },
        { id: 'digital_services', label: 'Digital services' },
      ],
      monthlySalesRanges: [
        { id: 'under_10m_idr', label: 'Under IDR 10 million' },
        { id: '10m_to_50m_idr', label: 'IDR 10 million to 50 million' },
        { id: '50m_to_250m_idr', label: 'IDR 50 million to 250 million' },
        { id: 'above_250m_idr', label: 'Above IDR 250 million' },
      ],
      ownerRoles: [
        { id: 'owner', label: 'Owner', contributesOwnership: true },
        { id: 'director', label: 'Director', contributesOwnership: false },
      ],
      banks: [
        {
          id: 'demo_bank_alpha',
          label: 'Demo Bank Alpha',
          supportedPayoutScheduleIds: ['daily', 'weekly'],
        },
        { id: 'demo_bank_beta', label: 'Demo Bank Beta', supportedPayoutScheduleIds: ['weekly'] },
      ],
      accountHolderTypes: [
        { id: 'business', label: 'Business', requiresOwnerReference: false },
        { id: 'owner', label: 'Owner', requiresOwnerReference: true },
      ],
      payoutSchedules: [
        { id: 'daily', label: 'Daily' },
        { id: 'weekly', label: 'Weekly' },
      ],
      termsVersion: '2026-08-30',
    });
  });

  it('valid submission returns 201 with envelope, Location, and safe settlement data', async () => {
    const { accessToken } = await registerUser(baseUrl);
    const idempotencyKey = randomUUID();

    const res = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(buildApplicationPayload())
      .expect(201);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['location']).toMatch(/^\/v1\/merchant-onboarding\/applications\//);
    expect(typeof getStringField(res.body.data, 'applicationId')).toBe('string');
    const submittedAt = getStringField(res.body.data, 'submittedAt');
    expect(Number.isNaN(Date.parse(submittedAt))).toBe(false);
    expect(res.body.data.settlement).toEqual({
      bankId: 'demo_bank_alpha',
      accountNumberLast4: '5678',
    });
    expect(res.text).not.toContain(RAW_ACCOUNT_NUMBER);
  });

  it('identical idempotent replay returns the stored response without a second mutation', async () => {
    const { accessToken, userId } = await registerUser(baseUrl);
    const idempotencyKey = randomUUID();
    const payload = buildApplicationPayload();

    const first = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);

    const replayed = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);

    expect(replayed.headers['idempotency-replayed']).toBe('true');
    expect(replayed.body).toEqual(first.body);
    expect(replayed.headers['location']).toBe(first.headers['location']);

    const applicationCount = await prisma.merchantApplication.count({ where: { userId } });
    expect(applicationCount).toBe(1);
  });

  it('reusing the idempotency key with a different payload returns the platform conflict', async () => {
    const { accessToken } = await registerUser(baseUrl);
    const idempotencyKey = randomUUID();

    await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(buildApplicationPayload())
      .expect(201);

    const conflict = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(buildApplicationPayload({ accountNumber: '0098765432' }))
      .expect(409);

    expect(conflict.headers['content-type']).toContain('application/problem+json');
    expect(conflict.body).toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('submit without an Idempotency-Key returns VALIDATION_FAILED', async () => {
    const { accessToken } = await registerUser(baseUrl);

    const res = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(buildApplicationPayload())
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'Idempotency-Key' })]),
    );
  });

  it('a second application for the same user returns APPLICATION_ALREADY_EXISTS', async () => {
    const { accessToken } = await registerUser(baseUrl);

    await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload())
      .expect(201);

    const duplicate = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload())
      .expect(409);

    expect(duplicate.headers['content-type']).toContain('application/problem+json');
    expect(duplicate.body).toMatchObject({
      code: 'MERCHANT_ONBOARDING_APPLICATION_ALREADY_EXISTS',
      status: 409,
    });
  });

  it('a duplicate registration number returns REGISTRATION_ALREADY_EXISTS with the field path', async () => {
    const first = await registerUser(baseUrl);
    const second = await registerUser(baseUrl);
    const registrationNumber = uniqueRegistrationNumber();

    await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload({ registrationNumber }))
      .expect(201);

    const duplicate = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload({ registrationNumber }))
      .expect(409);

    expect(duplicate.headers['content-type']).toContain('application/problem+json');
    expect(duplicate.body).toMatchObject({
      code: 'MERCHANT_ONBOARDING_REGISTRATION_ALREADY_EXISTS',
      status: 409,
    });
    expect(duplicate.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'business.registrationNumber' })]),
    );
  });

  it('invalid nested fields return RFC7807 errors with usable paths', async () => {
    const { accessToken } = await registerUser(baseUrl);
    const transportPayload = buildApplicationPayload();
    transportPayload.owners = [
      {
        ownerRowId: randomUUID(),
        fullName: 'Ari Example',
        roleId: 'owner',
        ownershipBasisPoints: 10000,
        email: 'not-an-email',
        isPrimaryContact: true,
      },
    ];

    const transport = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(transportPayload)
      .expect(400);

    expect(transport.headers['content-type']).toContain('application/problem+json');
    expect(transport.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(JSON.stringify(transport.body.errors)).toContain('email');

    const businessPayload = buildApplicationPayload();
    businessPayload.business.legalName = '   ';

    const businessPolicy = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(businessPayload)
      .expect(400);

    expect(businessPolicy.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(businessPolicy.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'business.legalName',
          message: 'business.legal_name.required',
        }),
      ]),
    );
  });

  it('unknown reference IDs return REFERENCE_DATA_STALE with the selected path', async () => {
    const { accessToken } = await registerUser(baseUrl);

    const res = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload({ businessTypeId: 'unknown_type' }))
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      code: 'MERCHANT_ONBOARDING_REFERENCE_DATA_STALE',
      status: 409,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'business.businessTypeId',
          message: 'business.type.unsupported',
        }),
      ]),
    );
  });

  it('a stale terms version returns TERMS_VERSION_STALE', async () => {
    const { accessToken } = await registerUser(baseUrl);
    const payload = buildApplicationPayload();
    payload.declarations.termsVersion = '2026-07-01';

    const res = await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      code: 'MERCHANT_ONBOARDING_TERMS_VERSION_STALE',
      status: 409,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'declarations.termsVersion',
          message: 'declarations.terms_version.stale',
        }),
      ]),
    );
  });

  it('stores only the last four digits and never the raw account number', async () => {
    const { accessToken, userId } = await registerUser(baseUrl);

    await request(baseUrl)
      .post('/v1/merchant-onboarding/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(buildApplicationPayload())
      .expect(201);

    const stored = await prisma.merchantApplication.findFirst({ where: { userId } });
    if (!stored) {
      throw new Error('Expected a stored application row');
    }
    expect(stored.accountNumberLast4).toBe('5678');
    expect(JSON.stringify(stored)).not.toContain(RAW_ACCOUNT_NUMBER);

    const owners = await prisma.merchantOwner.findMany({
      where: { applicationId: stored.id },
    });
    expect(owners).toHaveLength(1);
    expect(JSON.stringify(owners)).not.toContain(RAW_ACCOUNT_NUMBER);
  });
});
