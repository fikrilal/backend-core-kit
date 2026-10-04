import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createApiApp } from '../../apps/api/src/bootstrap';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';

export type MerchantOnboardingE2eHarness = Readonly<{
  baseUrl: () => string;
  prisma: () => PrismaClient;
}>;

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getBodyData(body: unknown): Record<string, unknown> {
  if (!isObject(body)) {
    throw new Error('Expected response body object');
  }
  const data = body.data;
  if (!isObject(data)) {
    throw new Error('Expected response body.data object');
  }
  return data;
}

export function getStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.trim() === '') {
    throw new Error(`Expected string field "${key}"`);
  }
  return field;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}-${randomUUID()}@example.com`;
}

export function describeMerchantOnboardingE2eSuite(
  suiteName: string,
  register: (harness: MerchantOnboardingE2eHarness) => void,
): void {
  (skipDepsTests ? describe.skip : describe)(suiteName, () => {
    let app: Awaited<ReturnType<typeof createApiApp>> | undefined;
    let baseUrl: string | undefined;
    let prisma: PrismaClient | undefined;

    const harness: MerchantOnboardingE2eHarness = {
      baseUrl: () => required(baseUrl, 'baseUrl is not initialized'),
      prisma: () => required(prisma, 'prisma is not initialized'),
    };

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error(
          'DATABASE_URL is required for MerchantOnboarding (e2e) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
        );
      }
      if (!redisUrl) {
        throw new Error(
          'REDIS_URL is required for MerchantOnboarding (e2e) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
        );
      }

      process.env.RESEND_API_KEY ??= 're_test_dummy';
      process.env.EMAIL_FROM ??= 'no-reply@example.com';
      process.env.PUBLIC_APP_URL ??= 'http://localhost:3000';

      // Enable push/email platform modules in e2e tests without real credentials.
      process.env.PUSH_PROVIDER ??= 'FCM';
      process.env.FCM_PROJECT_ID ??= 'test-project';
      process.env.FCM_USE_APPLICATION_DEFAULT = '';
      process.env.FCM_SERVICE_ACCOUNT_JSON_PATH = '';
      process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64 = '';
      process.env.FCM_SERVICE_ACCOUNT_JSON ??= (() => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        return JSON.stringify({
          project_id: process.env.FCM_PROJECT_ID,
          client_email: 'push-test@example.com',
          private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        });
      })();

      process.env.STORAGE_S3_ENDPOINT ??= 'http://127.0.0.1:59090';
      process.env.STORAGE_S3_REGION ??= 'us-east-1';
      process.env.STORAGE_S3_BUCKET ??= 'backend-core-kit';
      process.env.STORAGE_S3_ACCESS_KEY_ID ??= 'minioadmin';
      process.env.STORAGE_S3_SECRET_ACCESS_KEY ??= 'minioadmin';
      process.env.STORAGE_S3_FORCE_PATH_STYLE ??= 'true';

      const adapter = new PrismaPg({ connectionString: databaseUrl });
      prisma = new PrismaClient({ adapter });
      await prisma.$connect();

      app = await createApiApp();
      await app.listen({ port: 0, host: '127.0.0.1' });
      baseUrl = await app.getUrl();
    });

    afterEach(async () => {
      if (!prisma) return;
      await prisma.merchantOwner.deleteMany();
      await prisma.merchantApplication.deleteMany();
    });

    afterAll(async () => {
      if (prisma) {
        await prisma.$disconnect();
      }
      if (app) {
        await app.close();
      }
    });

    register(harness);
  });
}
