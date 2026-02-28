import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createApiApp } from '../../apps/api/src/bootstrap';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { CreateBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AuthSendVerificationEmailJobData } from '../../libs/features/auth/infra/jobs/auth-email-verification.job';
import type { AuthSendPasswordResetEmailJobData } from '../../libs/features/auth/infra/jobs/auth-password-reset.job';
import { EMAIL_QUEUE } from '../../libs/features/auth/infra/jobs/auth-email-verification.job';
import type {
  UsersSendAccountDeletionReminderEmailJobData,
  UsersSendAccountDeletionRequestedEmailJobData,
} from '../../libs/features/users/infra/jobs/user-account-deletion-email.job';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const storageEndpoint = process.env.STORAGE_S3_ENDPOINT?.trim();
const storageRegion = process.env.STORAGE_S3_REGION?.trim();
const storageBucket = process.env.STORAGE_S3_BUCKET?.trim();
const storageAccessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID?.trim();
const storageSecretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
const storageForcePathStyle = process.env.STORAGE_S3_FORCE_PATH_STYLE?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';

export type AuthEmailJobData =
  | AuthSendVerificationEmailJobData
  | AuthSendPasswordResetEmailJobData
  | UsersSendAccountDeletionRequestedEmailJobData
  | UsersSendAccountDeletionReminderEmailJobData;

export type AuthEmailQueue = Queue<AuthEmailJobData>;

export type AuthE2eHarness = Readonly<{
  baseUrl: () => string;
  prisma: () => PrismaClient;
  emailQueue: () => AuthEmailQueue;
  redis: () => Redis;
  s3: () => S3Client;
}>;

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFoundError(err: unknown): boolean {
  if (!isObject(err)) return false;

  const name = typeof err.name === 'string' ? err.name : undefined;
  if (name === 'NotFound' || name === 'NoSuchKey') return true;

  const metadata = err.$metadata;
  if (isObject(metadata) && typeof metadata.httpStatusCode === 'number') {
    return metadata.httpStatusCode === 404;
  }

  return false;
}

export async function expectObjectDeleted(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error(`Expected object "${key}" to be deleted`);
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

export function getSessionIdFromAccessToken(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Access token is not a JWT');
  }

  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new Error('Access token payload segment is missing');
  }

  const payloadJson = Buffer.from(payloadSegment, 'base64url').toString('utf8');
  const parsed: unknown = JSON.parse(payloadJson) as unknown;
  if (!isObject(parsed)) {
    throw new Error('Access token payload is not an object');
  }

  const sid = parsed.sid;
  if (typeof sid !== 'string' || sid.trim() === '') {
    throw new Error('Access token session id (sid) is missing');
  }

  return sid;
}

async function deleteKeysByPattern(redis: Redis, pattern: string): Promise<void> {
  let cursor = '0';
  const keysToDelete: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000');
    cursor = nextCursor;
    if (keys.length > 0) keysToDelete.push(...keys);
  } while (cursor !== '0');

  if (keysToDelete.length === 0) return;

  // Avoid large argv to DEL by batching.
  const batchSize = 500;
  for (let i = 0; i < keysToDelete.length; i += batchSize) {
    const batch = keysToDelete.slice(i, i + batchSize);
    await redis.del(...batch);
  }
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}-${randomUUID()}@example.com`;
}

export function describeAuthE2eSuite(
  suiteName: string,
  register: (harness: AuthE2eHarness) => void,
): void {
  (skipDepsTests ? describe.skip : describe)(suiteName, () => {
    let app: Awaited<ReturnType<typeof createApiApp>> | undefined;
    let baseUrl: string | undefined;
    let prisma: PrismaClient | undefined;
    let emailQueue: AuthEmailQueue | undefined;
    let redis: Redis | undefined;
    let s3: S3Client | undefined;

    const harness: AuthE2eHarness = {
      baseUrl: () => required(baseUrl, 'baseUrl is not initialized'),
      prisma: () => required(prisma, 'prisma is not initialized'),
      emailQueue: () => required(emailQueue, 'emailQueue is not initialized'),
      redis: () => required(redis, 'redis is not initialized'),
      s3: () => required(s3, 's3 is not initialized'),
    };

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error(
          'DATABASE_URL is required for Auth (e2e) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
        );
      }
      if (!redisUrl) {
        throw new Error(
          'REDIS_URL is required for Auth (e2e) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
        );
      }

      process.env.RESEND_API_KEY ??= 're_test_dummy';
      process.env.EMAIL_FROM ??= 'no-reply@example.com';
      process.env.PUBLIC_APP_URL ??= 'http://localhost:3000';

      // Enable push token endpoints in e2e tests without requiring real FCM credentials.
      process.env.PUSH_PROVIDER ??= 'FCM';
      process.env.FCM_PROJECT_ID ??= 'test-project';
      process.env.FCM_SERVICE_ACCOUNT_JSON ??= (() => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        return JSON.stringify({
          project_id: process.env.FCM_PROJECT_ID,
          client_email: 'push-test@example.com',
          private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        });
      })();

      process.env.STORAGE_S3_ENDPOINT ??= storageEndpoint ?? 'http://127.0.0.1:59090';
      process.env.STORAGE_S3_REGION ??= storageRegion ?? 'us-east-1';
      process.env.STORAGE_S3_BUCKET ??= storageBucket ?? 'backend-core-kit';
      process.env.STORAGE_S3_ACCESS_KEY_ID ??= storageAccessKeyId ?? 'minioadmin';
      process.env.STORAGE_S3_SECRET_ACCESS_KEY ??= storageSecretAccessKey ?? 'minioadmin';
      process.env.STORAGE_S3_FORCE_PATH_STYLE ??= storageForcePathStyle ?? 'true';

      // Keep limits small for deterministic rate-limit tests.
      process.env.USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS ??= '1';
      process.env.USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS ??= '60';
      process.env.USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS ??= '60';

      const adapter = new PrismaPg({ connectionString: databaseUrl });
      prisma = new PrismaClient({ adapter });
      await prisma.$connect();

      redis = new Redis(redisUrl);
      await redis.ping();

      s3 = new S3Client({
        region: process.env.STORAGE_S3_REGION ?? 'us-east-1',
        endpoint: process.env.STORAGE_S3_ENDPOINT,
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? 'minioadmin',
          secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? 'minioadmin',
        },
      });

      try {
        await s3.send(new CreateBucketCommand({ Bucket: process.env.STORAGE_S3_BUCKET }));
      } catch {
        // ignore (bucket may already exist)
      }

      emailQueue = new Queue<AuthEmailJobData>(EMAIL_QUEUE, { connection: { url: redisUrl } });
      await emailQueue.drain(true);

      app = await createApiApp();
      await app.listen({ port: 0, host: '127.0.0.1' });
      baseUrl = await app.getUrl();
    });

    afterEach(async () => {
      const q = required(emailQueue, 'emailQueue is not initialized');
      const r = required(redis, 'redis is not initialized');

      await q.drain(true);
      await Promise.all([
        deleteKeysByPattern(r, 'auth:login:*'),
        deleteKeysByPattern(r, 'auth:password-reset:request:*'),
        deleteKeysByPattern(r, 'auth:email-verification:resend:*'),
        deleteKeysByPattern(r, 'users:profile-image:upload:*'),
      ]);
    });

    afterAll(async () => {
      if (emailQueue) {
        await emailQueue.drain(true);
        await emailQueue.close();
      }
      if (redis) {
        await redis.quit();
      }
      if (prisma) {
        await prisma.$disconnect();
      }
      if (s3) {
        s3.destroy();
      }
      if (app) {
        await app.close();
      }
    });

    register(harness);
  });
}
