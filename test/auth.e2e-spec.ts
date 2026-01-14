import { generateKeyPairSync, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApiApp } from '../apps/api/src/bootstrap';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import {
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  AUTH_SEND_VERIFICATION_EMAIL_JOB,
  EMAIL_QUEUE,
  type AuthSendVerificationEmailJobData,
} from '../libs/features/auth/infra/jobs/auth-email-verification.job';
import {
  AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
  type AuthSendPasswordResetEmailJobData,
} from '../libs/features/auth/infra/jobs/auth-password-reset.job';
import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
  type UsersSendAccountDeletionReminderEmailJobData,
  type UsersSendAccountDeletionRequestedEmailJobData,
} from '../libs/features/users/infra/jobs/user-account-deletion-email.job';
import {
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../libs/features/auth/app/email-verification-token';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../libs/features/auth/app/password-reset-token';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const storageEndpoint = process.env.STORAGE_S3_ENDPOINT?.trim();
const storageRegion = process.env.STORAGE_S3_REGION?.trim();
const storageBucket = process.env.STORAGE_S3_BUCKET?.trim();
const storageAccessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID?.trim();
const storageSecretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
const storageForcePathStyle = process.env.STORAGE_S3_FORCE_PATH_STYLE?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';

function isObject(value: unknown): value is Record<string, unknown> {
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

async function expectObjectDeleted(s3: S3Client, bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error(`Expected object "${key}" to be deleted`);
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

function getSessionIdFromAccessToken(token: string): string {
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

(skipDepsTests ? describe.skip : describe)('Auth (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let baseUrl: string;
  let prisma: PrismaClient;
  let emailQueue: Queue<
    | AuthSendVerificationEmailJobData
    | AuthSendPasswordResetEmailJobData
    | UsersSendAccountDeletionRequestedEmailJobData
    | UsersSendAccountDeletionReminderEmailJobData
  >;
  let redis: Redis;
  let s3: S3Client;

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

    emailQueue = new Queue<
      | AuthSendVerificationEmailJobData
      | AuthSendPasswordResetEmailJobData
      | UsersSendAccountDeletionRequestedEmailJobData
      | UsersSendAccountDeletionReminderEmailJobData
    >(EMAIL_QUEUE, { connection: { url: redisUrl } });
    await emailQueue.drain(true);

    app = await createApiApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await emailQueue.drain(true);
    await Promise.all([
      deleteKeysByPattern(redis, 'auth:login:*'),
      deleteKeysByPattern(redis, 'auth:password-reset:request:*'),
      deleteKeysByPattern(redis, 'auth:email-verification:resend:*'),
      deleteKeysByPattern(redis, 'users:profile-image:upload:*'),
    ]);
  });

  afterAll(async () => {
    await emailQueue.drain(true);
    await emailQueue.close();
    await redis.quit();
    await prisma.$disconnect();
    s3.destroy();
    await app.close();
  });

  it('GET /.well-known/jwks.json returns public keys', async () => {
    const res = await request(baseUrl).get('/.well-known/jwks.json').expect(200);
    expect(res.body).toHaveProperty('keys');
    expect(Array.isArray(res.body.keys)).toBe(true);
  });

  it('register -> refresh -> logout -> refresh fails', async () => {
    const email = `user+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    expect(reg.user.email).toBe(email.toLowerCase());
    expect(reg.user.emailVerified).toBe(false);
    expect(typeof reg.accessToken).toBe('string');
    expect(typeof reg.refreshToken).toBe('string');

    const refreshRes = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: reg.refreshToken })
      .expect(200);

    const refreshed = refreshRes.body.data as {
      accessToken: string;
      refreshToken: string;
    };

    expect(typeof refreshed.accessToken).toBe('string');
    expect(typeof refreshed.refreshToken).toBe('string');
    expect(refreshed.refreshToken).not.toBe(reg.refreshToken);

    await request(baseUrl)
      .post('/v1/auth/logout')
      .send({ refreshToken: refreshed.refreshToken })
      .expect(204);

    const afterLogout = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: refreshed.refreshToken })
      .expect(401);

    expect(afterLogout.headers['content-type']).toContain('application/problem+json');
    expect(afterLogout.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });
  });

  it('refresh token reuse revokes the session (reuse detection)', async () => {
    const email = `refresh-reuse+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = registerRes.body.data as { refreshToken: string };

    const firstRefreshRes = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: reg.refreshToken })
      .expect(200);

    const first = firstRefreshRes.body.data as { refreshToken: string };
    expect(typeof first.refreshToken).toBe('string');
    expect(first.refreshToken).not.toBe(reg.refreshToken);

    const reuse = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: reg.refreshToken })
      .expect(401);

    expect(reuse.headers['content-type']).toContain('application/problem+json');
    expect(reuse.body).toMatchObject({ code: 'AUTH_REFRESH_TOKEN_REUSED', status: 401 });

    const afterReuse = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    expect(afterReuse.headers['content-type']).toContain('application/problem+json');
    expect(afterReuse.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });
  });

  it('register enqueues auth.sendVerificationEmail job when email is configured', async () => {
    const email = `verify-email+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
    };

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) => job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB && job.data.userId === reg.user.id,
    );

    expect(jobForUser).toBeDefined();
  });

  it('POST /v1/auth/email/verify verifies email and is idempotent', async () => {
    const email = `verify+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);
    const expiresAt = new Date(Date.now() + 60_000);

    await prisma.emailVerificationToken.create({
      data: { userId: reg.user.id, tokenHash, expiresAt },
      select: { id: true },
    });

    await request(baseUrl).post('/v1/auth/email/verify').send({ token }).expect(204);

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meRes.body.data).toMatchObject({ id: reg.user.id, emailVerified: true });

    // Replay should be safe.
    await request(baseUrl).post('/v1/auth/email/verify').send({ token }).expect(204);
  });

  it('POST /v1/auth/email/verify returns 400 for invalid token', async () => {
    const res = await request(baseUrl)
      .post('/v1/auth/email/verify')
      .send({ token: 'nope' })
      .expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'AUTH_EMAIL_VERIFICATION_TOKEN_INVALID', status: 400 });
  });

  it('POST /v1/auth/email/verify returns 400 for expired token', async () => {
    const email = `verify-expired+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string } };

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);

    await prisma.emailVerificationToken.create({
      data: { userId: reg.user.id, tokenHash, expiresAt: new Date(Date.now() - 60_000) },
      select: { id: true },
    });

    const res = await request(baseUrl).post('/v1/auth/email/verify').send({ token }).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'AUTH_EMAIL_VERIFICATION_TOKEN_EXPIRED', status: 400 });
  });

  it('POST /v1/auth/email/verification/resend enqueues a new verification email job and rate limits', async () => {
    const email = `verify-resend+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string }; accessToken: string };

    // Drop the register enqueue so the test only sees the resend enqueue.
    await emailQueue.drain(true);

    await request(baseUrl)
      .post('/v1/auth/email/verification/resend')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) => job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB && job.data.userId === reg.user.id,
    );
    expect(jobForUser).toBeDefined();

    const rateLimited = await request(baseUrl)
      .post('/v1/auth/email/verification/resend')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('POST /v1/auth/password/reset/request returns 429 RATE_LIMITED when called too frequently', async () => {
    const email = `pw-reset-rate-limit+${Date.now()}@example.com`;

    await request(baseUrl).post('/v1/auth/password/reset/request').send({ email }).expect(204);

    const rateLimited = await request(baseUrl)
      .post('/v1/auth/password/reset/request')
      .send({ email })
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('POST /v1/auth/password/reset/request enqueues auth.sendPasswordResetEmail job for existing user', async () => {
    const email = `pw-reset-request+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string } };

    // Drop the register enqueue so the test only sees the reset enqueue.
    await emailQueue.drain(true);

    await request(baseUrl)
      .post('/v1/auth/password/reset/request')
      .send({ email: email.toUpperCase() })
      .expect(204);

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) => job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB && job.data.userId === reg.user.id,
    );

    expect(jobForUser).toBeDefined();
  });

  it('POST /v1/auth/password/reset/request returns 204 for unknown email (no enumeration)', async () => {
    await emailQueue.drain(true);

    await request(baseUrl)
      .post('/v1/auth/password/reset/request')
      .send({ email: `nope+${Date.now()}@example.com` })
      .expect(204);

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const hasResetJob = jobs.some((job) => job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB);
    expect(hasResetJob).toBe(false);
  });

  it('register -> password reset confirm resets password and revokes sessions', async () => {
    const email = `pw-reset-confirm+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';
    const newPassword = 'new-correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
      refreshToken: string;
    };

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + 60_000);

    await prisma.passwordResetToken.create({
      data: { userId: reg.user.id, tokenHash, expiresAt },
      select: { id: true },
    });

    await request(baseUrl)
      .post('/v1/auth/password/reset/confirm')
      .send({ token, newPassword })
      .expect(204);

    const oldRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: reg.refreshToken })
      .expect(401);

    expect(oldRefresh.headers['content-type']).toContain('application/problem+json');
    expect(oldRefresh.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });

    await request(baseUrl).post('/v1/auth/password/login').send({ email, password }).expect(401);
    await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password: newPassword })
      .expect(200);

    const reuse = await request(baseUrl)
      .post('/v1/auth/password/reset/confirm')
      .send({ token, newPassword: 'another-new-password' })
      .expect(400);

    expect(reuse.headers['content-type']).toContain('application/problem+json');
    expect(reuse.body).toMatchObject({ code: 'AUTH_PASSWORD_RESET_TOKEN_INVALID', status: 400 });
  });

  it('POST /v1/auth/password/reset/confirm returns 400 for invalid token', async () => {
    const res = await request(baseUrl)
      .post('/v1/auth/password/reset/confirm')
      .send({ token: 'nope', newPassword: 'correct-horse-battery-staple' })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'AUTH_PASSWORD_RESET_TOKEN_INVALID', status: 400 });
  });

  it('POST /v1/auth/password/reset/confirm returns 400 for expired token', async () => {
    const email = `pw-reset-expired+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string } };

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);

    await prisma.passwordResetToken.create({
      data: { userId: reg.user.id, tokenHash, expiresAt: new Date(Date.now() - 60_000) },
      select: { id: true },
    });

    const res = await request(baseUrl)
      .post('/v1/auth/password/reset/confirm')
      .send({ token, newPassword: 'new-correct-horse-battery-staple' })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'AUTH_PASSWORD_RESET_TOKEN_EXPIRED', status: 400 });
  });

  it('POST /v1/auth/password/login returns 429 RATE_LIMITED after too many failures', async () => {
    const email = `login-rate-limit+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    // User does not need to exist; we only care about limiter behavior.
    for (let i = 0; i < 10; i += 1) {
      await request(baseUrl).post('/v1/auth/password/login').send({ email, password }).expect(401);
    }

    const rateLimited = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password })
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('POST /v1/auth/password/change requires an access token', async () => {
    const res = await request(baseUrl)
      .post('/v1/auth/password/change')
      .send({ currentPassword: 'x', newPassword: 'y' })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('register -> password change revokes other sessions and supports Idempotency-Key replay', async () => {
    const email = `pw-change+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';
    const newPassword = 'new-correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a' })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const loginRes = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password, deviceId: 'device-b' })
      .expect(200);

    const loggedIn = loginRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const idemKey = randomUUID();
    await request(baseUrl)
      .post('/v1/auth/password/change')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ currentPassword: password, newPassword })
      .expect(204);

    const currentSessionRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: reg.refreshToken })
      .expect(200);

    expect(typeof currentSessionRefresh.body.data.refreshToken).toBe('string');

    const replayed = await request(baseUrl)
      .post('/v1/auth/password/change')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ currentPassword: password, newPassword })
      .expect(204);

    expect(replayed.headers['idempotency-replayed']).toBe('true');

    const otherSessionRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: loggedIn.refreshToken })
      .expect(401);

    expect(otherSessionRefresh.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });

    const oldLogin = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password })
      .expect(401);

    expect(oldLogin.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: 401 });

    await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('GET /v1/me requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/me').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('GET /v1/me/sessions requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/me/sessions').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('PATCH /v1/me requires an access token', async () => {
    const res = await request(baseUrl)
      .patch('/v1/me')
      .send({ profile: { displayName: 'Dante' } })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('POST /v1/me/profile-image/upload requires an access token', async () => {
    const res = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .send({ contentType: 'image/png', sizeBytes: 100 })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('POST /v1/me/profile-image/complete requires an access token', async () => {
    const res = await request(baseUrl)
      .post('/v1/me/profile-image/complete')
      .send({ fileId: randomUUID() })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('GET /v1/me/profile-image/url requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/me/profile-image/url').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('DELETE /v1/me/profile-image requires an access token', async () => {
    const res = await request(baseUrl).delete('/v1/me/profile-image').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('POST /v1/me/sessions/:sessionId/revoke requires an access token', async () => {
    const res = await request(baseUrl).post(`/v1/me/sessions/${randomUUID()}/revoke`).expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('register -> GET /v1/me returns current user', async () => {
    const email = `me+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean; authMethods: string[] };
      accessToken: string;
      refreshToken: string;
    };

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(reg.user.authMethods).toEqual(['PASSWORD']);
    expect(meRes.body.data).toMatchObject({
      id: reg.user.id,
      email: email.toLowerCase(),
      emailVerified: false,
      roles: ['USER'],
      authMethods: ['PASSWORD'],
      profile: { profileImageFileId: null, displayName: null, givenName: null, familyName: null },
    });
  });

  it('GET /v1/me/profile-image/url returns 204 when no profile image is set', async () => {
    const email = `me-profile-image-url+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    await request(baseUrl)
      .get('/v1/me/profile-image/url')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);
  });

  it('register -> profile image upload/complete attaches image and returns a view URL', async () => {
    const email = `me-profile-image-upload+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    const contentType = 'image/png';
    const imageBytes = Buffer.from(`fake-png-${Date.now()}`, 'utf8');

    const uploadPlanRes = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType, sizeBytes: imageBytes.length })
      .expect(200);

    const plan = uploadPlanRes.body.data as {
      fileId: string;
      upload: { method: string; url: string; headers: Record<string, string> };
      expiresAt: string;
    };

    expect(typeof plan.fileId).toBe('string');
    expect(plan.upload).toMatchObject({ method: 'PUT' });
    expect(typeof plan.upload.url).toBe('string');
    expect(plan.upload.headers).toMatchObject({ 'Content-Type': contentType });

    const putRes = await fetch(plan.upload.url, {
      method: 'PUT',
      headers: plan.upload.headers,
      body: imageBytes,
    });
    expect(putRes.ok).toBe(true);

    await request(baseUrl)
      .post('/v1/me/profile-image/complete')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ fileId: plan.fileId })
      .expect(204);

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meRes.body.data.profile).toMatchObject({ profileImageFileId: plan.fileId });

    const urlRes = await request(baseUrl)
      .get('/v1/me/profile-image/url')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    const view = urlRes.body.data as { url: string; expiresAt: string };
    expect(typeof view.url).toBe('string');
    expect(typeof view.expiresAt).toBe('string');

    const getRes = await fetch(view.url);
    expect(getRes.ok).toBe(true);
    const downloaded = Buffer.from(await getRes.arrayBuffer());
    expect(downloaded.equals(imageBytes)).toBe(true);
  });

  it('profile image complete returns 409 USERS_PROFILE_IMAGE_NOT_UPLOADED when object is missing', async () => {
    const email = `me-profile-image-missing+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    const uploadPlanRes = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType: 'image/png', sizeBytes: 10 })
      .expect(200);

    const plan = uploadPlanRes.body.data as { fileId: string };

    const completeRes = await request(baseUrl)
      .post('/v1/me/profile-image/complete')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ fileId: plan.fileId })
      .expect(409);

    expect(completeRes.headers['content-type']).toContain('application/problem+json');
    expect(completeRes.body).toMatchObject({
      code: 'USERS_PROFILE_IMAGE_NOT_UPLOADED',
      status: 409,
    });
  });

  it('profile image complete returns 409 USERS_PROFILE_IMAGE_SIZE_MISMATCH and deletes the object', async () => {
    const email = `me-profile-image-size-mismatch+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string }; accessToken: string };

    const uploadPlanRes = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType: 'image/png', sizeBytes: 10 })
      .expect(200);

    const plan = uploadPlanRes.body.data as { fileId: string };
    const bucket = process.env.STORAGE_S3_BUCKET ?? 'backend-core-kit';
    const objectKey = `users/${reg.user.id}/profile-images/${plan.fileId}`;

    // Upload with a different size than declared.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: Buffer.from('123456789', 'utf8'), // 9 bytes
        ContentType: 'image/png',
      }),
    );

    const completeRes = await request(baseUrl)
      .post('/v1/me/profile-image/complete')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ fileId: plan.fileId })
      .expect(409);

    expect(completeRes.headers['content-type']).toContain('application/problem+json');
    expect(completeRes.body).toMatchObject({
      code: 'USERS_PROFILE_IMAGE_SIZE_MISMATCH',
      status: 409,
    });

    await expectObjectDeleted(s3, bucket, objectKey);

    const stored = await prisma.storedFile.findUnique({
      where: { id: plan.fileId },
      select: { status: true },
    });
    expect(stored?.status).toBe('DELETED');
  });

  it('profile image complete returns 409 USERS_PROFILE_IMAGE_CONTENT_TYPE_MISMATCH and deletes the object', async () => {
    const email = `me-profile-image-content-type-mismatch+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { user: { id: string }; accessToken: string };

    const uploadPlanRes = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType: 'image/png', sizeBytes: 9 })
      .expect(200);

    const plan = uploadPlanRes.body.data as { fileId: string };
    const bucket = process.env.STORAGE_S3_BUCKET ?? 'backend-core-kit';
    const objectKey = `users/${reg.user.id}/profile-images/${plan.fileId}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: Buffer.from('123456789', 'utf8'),
        ContentType: 'image/jpeg',
      }),
    );

    const completeRes = await request(baseUrl)
      .post('/v1/me/profile-image/complete')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ fileId: plan.fileId })
      .expect(409);

    expect(completeRes.headers['content-type']).toContain('application/problem+json');
    expect(completeRes.body).toMatchObject({
      code: 'USERS_PROFILE_IMAGE_CONTENT_TYPE_MISMATCH',
      status: 409,
    });

    await expectObjectDeleted(s3, bucket, objectKey);

    const stored = await prisma.storedFile.findUnique({
      where: { id: plan.fileId },
      select: { status: true },
    });
    expect(stored?.status).toBe('DELETED');
  });

  it('POST /v1/me/profile-image/upload returns 429 RATE_LIMITED on repeated calls', async () => {
    const email = `me-profile-image-rate-limit+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType: 'image/png', sizeBytes: 123 })
      .expect(200);

    const rateLimited = await request(baseUrl)
      .post('/v1/me/profile-image/upload')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ contentType: 'image/png', sizeBytes: 123 })
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('register -> login -> GET /v1/me/sessions returns sessions and marks current', async () => {
    const email = `me-sessions+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
      accessToken: string;
      refreshToken: string;
    };

    const loginRes = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password, deviceId: 'device-b', deviceName: 'Device B' })
      .expect(200);

    const loggedIn = loginRes.body.data as {
      user: { authMethods: string[] };
      accessToken: string;
      refreshToken: string;
    };

    expect(loggedIn.user.authMethods).toEqual(['PASSWORD']);
    expect(typeof loggedIn.refreshToken).toBe('string');
    expect(loggedIn.refreshToken).not.toBe(reg.refreshToken);

    const currentSessionId = getSessionIdFromAccessToken(reg.accessToken);

    const sessionsRes = await request(baseUrl)
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    const sessions = sessionsRes.body.data as Array<{
      id: string;
      current: boolean;
      status: string;
    }>;
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const current = sessions.find((s) => s.id === currentSessionId);
    expect(current).toBeDefined();
    expect(current?.current).toBe(true);
  });

  it('register -> login -> revoke session revokes refresh tokens and returns 404 for unknown session', async () => {
    const email = `me-sessions-revoke+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a' })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    const loginRes = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password, deviceId: 'device-b' })
      .expect(200);

    const loggedIn = loginRes.body.data as { accessToken: string; refreshToken: string };

    const sessionIdToRevoke = getSessionIdFromAccessToken(loggedIn.accessToken);

    await request(baseUrl)
      .post(`/v1/me/sessions/${sessionIdToRevoke}/revoke`)
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    // Idempotent replay should be safe.
    await request(baseUrl)
      .post(`/v1/me/sessions/${sessionIdToRevoke}/revoke`)
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const oldRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: loggedIn.refreshToken })
      .expect(401);

    expect(oldRefresh.headers['content-type']).toContain('application/problem+json');
    expect(oldRefresh.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });

    const missing = await request(baseUrl)
      .post(`/v1/me/sessions/${randomUUID()}/revoke`)
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(404);

    expect(missing.headers['content-type']).toContain('application/problem+json');
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('revoked session cannot clear push token on an active session', async () => {
    const email = `me-push-token+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';
    const pushToken = `fcm-${randomUUID()}`;

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };
    const sessionA = getSessionIdFromAccessToken(reg.accessToken);

    const loginRes = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password, deviceId: 'device-b', deviceName: 'Device B' })
      .expect(200);

    const loggedIn = loginRes.body.data as { accessToken: string };
    const sessionB = getSessionIdFromAccessToken(loggedIn.accessToken);

    await request(baseUrl)
      .put('/v1/me/push-token')
      .set('Authorization', `Bearer ${loggedIn.accessToken}`)
      .send({ platform: 'ANDROID', token: pushToken })
      .expect(204);

    const before = await prisma.session.findUnique({
      where: { id: sessionB },
      select: { pushToken: true },
    });
    expect(before?.pushToken).toBe(pushToken);

    await request(baseUrl)
      .post(`/v1/me/sessions/${sessionA}/revoke`)
      .set('Authorization', `Bearer ${loggedIn.accessToken}`)
      .expect(204);

    // Access tokens remain valid until expiry, but the session is revoked; this must not clear token
    // registration on active sessions.
    await request(baseUrl)
      .put('/v1/me/push-token')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ platform: 'ANDROID', token: pushToken })
      .expect(401);

    const after = await prisma.session.findUnique({
      where: { id: sessionB },
      select: { pushToken: true },
    });
    expect(after?.pushToken).toBe(pushToken);
  });

  it('register -> PATCH /v1/me updates profile', async () => {
    const email = `me-patch+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const patchRes = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({
        profile: {
          displayName: '  Dante  ',
          givenName: 'Dante',
          familyName: ' Alighieri ',
        },
      })
      .expect(200);

    expect(patchRes.body.data).toMatchObject({
      id: reg.user.id,
      email: email.toLowerCase(),
      emailVerified: false,
      roles: ['USER'],
      profile: {
        profileImageFileId: null,
        displayName: 'Dante',
        givenName: 'Dante',
        familyName: 'Alighieri',
      },
    });

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meRes.body.data.profile).toEqual({
      profileImageFileId: null,
      displayName: 'Dante',
      givenName: 'Dante',
      familyName: 'Alighieri',
    });
  });

  it('PATCH /v1/me supports Idempotency-Key replay for safe retries', async () => {
    const email = `me-idem+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const idemKey = randomUUID();
    const payload = { profile: { displayName: 'Dante' } };

    const first = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send(payload)
      .expect(200);

    const replayed = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send(payload)
      .expect(200);

    expect(replayed.headers['idempotency-replayed']).toBe('true');
    expect(replayed.body).toEqual(first.body);

    const conflict = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ profile: { displayName: 'Virgil' } })
      .expect(409);

    expect(conflict.headers['content-type']).toContain('application/problem+json');
    expect(conflict.body).toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('register -> PATCH /v1/me supports clearing fields with null', async () => {
    const email = `me-clear+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ profile: { displayName: 'Dante' } })
      .expect(200);

    const cleared = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ profile: { displayName: null } })
      .expect(200);

    expect(cleared.body.data.profile).toMatchObject({
      profileImageFileId: null,
      displayName: null,
      givenName: null,
      familyName: null,
    });
  });

  it('PATCH /v1/me rejects empty patches', async () => {
    const email = `me-empty+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const res = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ profile: {} })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'profile',
          message: 'At least one profile field must be provided',
        }),
      ]),
    );
  });

  it('PATCH /v1/me rejects whitespace-only strings', async () => {
    const email = `me-ws+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const res = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .send({ profile: { displayName: '   ' } })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'profile.displayName' })]),
    );
  });

  it('GET /v1/admin/whoami uses DB-hydrated roles (promotion takes effect immediately)', async () => {
    const email = `admin+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const forbidden = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(403);

    expect(forbidden.headers['content-type']).toContain('application/problem+json');
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });

    await prisma.user.update({ where: { id: reg.user.id }, data: { role: UserRole.ADMIN } });

    const whoami = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(whoami.body.data).toMatchObject({
      userId: reg.user.id,
      emailVerified: false,
      roles: ['ADMIN'],
    });
    expect(typeof whoami.body.data.sessionId).toBe('string');
  });

  it('GET /v1/admin/whoami uses DB-hydrated roles (demotion takes effect immediately)', async () => {
    const email = `admin-demote+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    await prisma.user.update({ where: { id: reg.user.id }, data: { role: UserRole.ADMIN } });

    await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    await prisma.user.update({ where: { id: reg.user.id }, data: { role: UserRole.USER } });

    const forbidden = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(403);

    expect(forbidden.headers['content-type']).toContain('application/problem+json');
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('GET /v1/admin/users supports search, filters, sort, and pagination (admin only)', async () => {
    const runId = Date.now();
    const password = 'correct-horse-battery-staple';

    const adminRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `admin-users+${runId}@example.com`, password })
      .expect(200);

    const adminReg = adminRegisterRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const forbidden = await request(baseUrl)
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .expect(403);

    expect(forbidden.headers['content-type']).toContain('application/problem+json');
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const prefix = `list+${runId}`;
    const userEmails = [
      `${prefix}-a@example.com`,
      `${prefix}-b@example.com`,
      `${prefix}-c@example.com`,
    ];

    for (const email of userEmails) {
      await request(baseUrl)
        .post('/v1/auth/password/register')
        .send({ email, password })
        .expect(200);
    }

    await prisma.user.update({ where: { id: adminReg.user.id }, data: { role: UserRole.ADMIN } });

    const refreshRes = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: adminReg.refreshToken })
      .expect(200);

    const refreshed = refreshRes.body.data as {
      accessToken: string;
      refreshToken: string;
    };

    const listUrlPage1 = `/v1/admin/users?limit=2&sort=email&q=${encodeURIComponent(
      prefix,
    )}&filter%5Brole%5D=USER&filter%5BemailVerified%5D=false`;

    const page1 = await request(baseUrl)
      .get(listUrlPage1)
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(200);

    expect(Array.isArray(page1.body.data)).toBe(true);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta).toMatchObject({ limit: 2, hasMore: true });
    expect(typeof page1.body.meta.nextCursor).toBe('string');

    for (const u of page1.body.data as Array<{
      id: string;
      email: string;
      emailVerified: boolean;
      roles: string[];
      createdAt: string;
    }>) {
      expect(u.email).toContain(prefix);
      expect(u.emailVerified).toBe(false);
      expect(u.roles).toEqual(['USER']);
      expect(typeof u.createdAt).toBe('string');
    }

    const nextCursor = page1.body.meta.nextCursor as string;
    const listUrlPage2 = `${listUrlPage1}&cursor=${encodeURIComponent(nextCursor)}`;

    const page2 = await request(baseUrl)
      .get(listUrlPage2)
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(200);

    expect(Array.isArray(page2.body.data)).toBe(true);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toMatchObject({ limit: 2, hasMore: false });
    expect(page2.body.meta.nextCursor).toBeUndefined();

    const emails = (page1.body.data as Array<{ email: string }>).map((u) => u.email);
    expect(emails).toEqual([userEmails[0], userEmails[1]]);
    expect((page2.body.data as Array<{ email: string }>)[0].email).toBe(userEmails[2]);
  });

  it('PATCH /v1/admin/users/:userId/role updates roles and blocks last-admin demotion', async () => {
    const runId = Date.now();
    const password = 'correct-horse-battery-staple';

    const adminRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `admin-role+${runId}@example.com`, password })
      .expect(200);

    const adminReg = adminRegisterRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const userRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `user-role+${runId}@example.com`, password })
      .expect(200);

    const userReg = userRegisterRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    await prisma.user.update({ where: { id: adminReg.user.id }, data: { role: UserRole.ADMIN } });

    const promoteTraceId = randomUUID();
    const promoted = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', promoteTraceId)
      .send({ role: 'ADMIN' })
      .expect(200);

    expect(promoted.body.data).toMatchObject({ id: userReg.user.id, roles: ['ADMIN'] });

    expect(promoted.headers['x-request-id']).toBe(promoteTraceId);

    const promoteAudit = await prisma.userRoleChangeAudit.findFirst({
      where: { traceId: promoteTraceId },
    });

    expect(promoteAudit).toMatchObject({
      actorUserId: adminReg.user.id,
      actorSessionId: expect.any(String),
      targetUserId: userReg.user.id,
      oldRole: UserRole.USER,
      newRole: UserRole.ADMIN,
      traceId: promoteTraceId,
    });

    await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .expect(200);

    const selfDemoteTraceId = randomUUID();
    const selfDemoted = await request(baseUrl)
      .patch(`/v1/admin/users/${adminReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', selfDemoteTraceId)
      .send({ role: 'USER' })
      .expect(200);

    expect(selfDemoted.body.data).toMatchObject({ id: adminReg.user.id, roles: ['USER'] });

    expect(selfDemoted.headers['x-request-id']).toBe(selfDemoteTraceId);

    const selfDemoteAudit = await prisma.userRoleChangeAudit.findFirst({
      where: { traceId: selfDemoteTraceId },
    });

    expect(selfDemoteAudit).toMatchObject({
      actorUserId: adminReg.user.id,
      actorSessionId: expect.any(String),
      targetUserId: adminReg.user.id,
      oldRole: UserRole.ADMIN,
      newRole: UserRole.USER,
      traceId: selfDemoteTraceId,
    });

    const forbidden = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .expect(403);

    expect(forbidden.headers['content-type']).toContain('application/problem+json');
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });

    await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .expect(200);

    await prisma.user.updateMany({
      where: { role: UserRole.ADMIN, id: { not: userReg.user.id } },
      data: { role: UserRole.USER },
    });

    const lastAdminTraceId = randomUUID();
    const lastAdminBlocked = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .set('X-Request-Id', lastAdminTraceId)
      .send({ role: 'USER' })
      .expect(409);

    expect(lastAdminBlocked.headers['content-type']).toContain('application/problem+json');
    expect(lastAdminBlocked.body).toMatchObject({
      code: 'ADMIN_CANNOT_DEMOTE_LAST_ADMIN',
      status: 409,
    });

    expect(lastAdminBlocked.headers['x-request-id']).toBe(lastAdminTraceId);

    const lastAdminAudit = await prisma.userRoleChangeAudit.findFirst({
      where: { traceId: lastAdminTraceId },
    });
    expect(lastAdminAudit).toBeNull();
  });

  it('PATCH /v1/admin/users/:userId/status suspends a user (403 AUTH_USER_SUSPENDED) and blocks last-admin suspension', async () => {
    const runId = Date.now();
    const password = 'correct-horse-battery-staple';

    const adminRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `admin-status+${runId}@example.com`, password })
      .expect(200);

    const adminReg = adminRegisterRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const userRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `user-status+${runId}@example.com`, password })
      .expect(200);

    const userReg = userRegisterRes.body.data as {
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    await prisma.user.update({ where: { id: adminReg.user.id }, data: { role: UserRole.ADMIN } });

    await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);

    await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .expect(200);

    const suspendTraceId = randomUUID();
    const suspended = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/status`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', suspendTraceId)
      .send({ status: 'SUSPENDED', reason: 'Abuse detected' })
      .expect(200);

    expect(suspended.body.data).toMatchObject({
      id: userReg.user.id,
      status: 'SUSPENDED',
      suspendedReason: 'Abuse detected',
    });

    expect(suspended.headers['x-request-id']).toBe(suspendTraceId);

    const suspendAudit = await prisma.userStatusChangeAudit.findFirst({
      where: { traceId: suspendTraceId },
    });

    expect(suspendAudit).toMatchObject({
      actorUserId: adminReg.user.id,
      actorSessionId: expect.any(String),
      targetUserId: userReg.user.id,
      oldStatus: UserStatus.ACTIVE,
      newStatus: UserStatus.SUSPENDED,
      reason: 'Abuse detected',
      traceId: suspendTraceId,
    });

    const refreshBlocked = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: userReg.refreshToken })
      .expect(403);

    expect(refreshBlocked.headers['content-type']).toContain('application/problem+json');
    expect(refreshBlocked.body).toMatchObject({ code: 'AUTH_USER_SUSPENDED', status: 403 });

    const loginBlocked = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email: userReg.user.email, password })
      .expect(403);

    expect(loginBlocked.headers['content-type']).toContain('application/problem+json');
    expect(loginBlocked.body).toMatchObject({ code: 'AUTH_USER_SUSPENDED', status: 403 });

    const adminBlocked = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .expect(403);

    expect(adminBlocked.headers['content-type']).toContain('application/problem+json');
    expect(adminBlocked.body).toMatchObject({ code: 'AUTH_USER_SUSPENDED', status: 403 });

    const unsuspendTraceId = randomUUID();
    const unsuspended = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/status`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', unsuspendTraceId)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(unsuspended.body.data).toMatchObject({ id: userReg.user.id, status: 'ACTIVE' });

    const backToAdmin = await request(baseUrl)
      .get('/v1/admin/whoami')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .expect(200);

    expect(backToAdmin.body.data).toMatchObject({ userId: userReg.user.id });

    await prisma.user.updateMany({
      where: { role: UserRole.ADMIN, id: { not: adminReg.user.id } },
      data: { role: UserRole.USER },
    });

    const lastAdminTraceId = randomUUID();
    const lastAdminBlocked = await request(baseUrl)
      .patch(`/v1/admin/users/${adminReg.user.id}/status`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', lastAdminTraceId)
      .send({ status: 'SUSPENDED' })
      .expect(409);

    expect(lastAdminBlocked.headers['content-type']).toContain('application/problem+json');
    expect(lastAdminBlocked.body).toMatchObject({
      code: 'ADMIN_CANNOT_SUSPEND_LAST_ADMIN',
      status: 409,
    });

    const lastAdminAudit = await prisma.userStatusChangeAudit.findFirst({
      where: { traceId: lastAdminTraceId },
    });
    expect(lastAdminAudit).toBeNull();
  });

  it('GET /v1/admin/audit/user-role-changes requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/admin/audit/user-role-changes').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('GET /v1/admin/audit/user-role-changes is forbidden for non-admin', async () => {
    const email = `audit-user+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as { accessToken: string };

    const res = await request(baseUrl)
      .get('/v1/admin/audit/user-role-changes')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(403);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('GET /v1/admin/audit/user-role-changes supports filtering by traceId', async () => {
    const runId = Date.now();
    const password = 'correct-horse-battery-staple';

    const adminRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `admin-audit+${runId}@example.com`, password })
      .expect(200);

    const adminReg = adminRegisterRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    const userRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `user-audit+${runId}@example.com`, password })
      .expect(200);

    const userReg = userRegisterRes.body.data as {
      user: { id: string };
    };

    await prisma.user.update({ where: { id: adminReg.user.id }, data: { role: UserRole.ADMIN } });

    const traceId = randomUUID();
    await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .set('X-Request-Id', traceId)
      .send({ role: 'ADMIN' })
      .expect(200);

    const listRes = await request(baseUrl)
      .get(`/v1/admin/audit/user-role-changes?filter[traceId][eq]=${encodeURIComponent(traceId)}`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.meta).toMatchObject({ limit: 25, hasMore: false });
    expect(listRes.body.meta.nextCursor).toBeUndefined();

    const item = (listRes.body.data as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({
      actorUserId: adminReg.user.id,
      actorSessionId: getSessionIdFromAccessToken(adminReg.accessToken),
      targetUserId: userReg.user.id,
      oldRole: 'USER',
      newRole: 'ADMIN',
      traceId,
    });
    expect(typeof item.id).toBe('string');
    expect(typeof item.createdAt).toBe('string');
  });

  it('GET /v1/admin/audit/user-account-deletions supports filtering by traceId', async () => {
    const runId = Date.now();
    const password = 'correct-horse-battery-staple';

    const adminRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `admin-audit-del+${runId}@example.com`, password })
      .expect(200);

    const adminReg = adminRegisterRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    const userRegisterRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email: `user-audit-del+${runId}@example.com`, password })
      .expect(200);

    const userReg = userRegisterRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    await prisma.user.update({ where: { id: adminReg.user.id }, data: { role: UserRole.ADMIN } });

    const traceId = randomUUID();
    await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .set('X-Request-Id', traceId)
      .expect(204);

    const listRes = await request(baseUrl)
      .get(
        `/v1/admin/audit/user-account-deletions?filter[traceId][eq]=${encodeURIComponent(traceId)}`,
      )
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.meta).toMatchObject({ limit: 25, hasMore: false });
    expect(listRes.body.meta.nextCursor).toBeUndefined();

    const item = (listRes.body.data as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({
      actorUserId: userReg.user.id,
      actorSessionId: getSessionIdFromAccessToken(userReg.accessToken),
      targetUserId: userReg.user.id,
      action: 'REQUESTED',
      traceId,
    });
    expect(typeof item.id).toBe('string');
    expect(typeof item.createdAt).toBe('string');
  });

  it('duplicate register returns AUTH_EMAIL_ALREADY_EXISTS', async () => {
    const email = `dupe+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    await request(baseUrl).post('/v1/auth/password/register').send({ email, password }).expect(200);

    const res = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(409);

    expect(res.body).toMatchObject({ code: 'AUTH_EMAIL_ALREADY_EXISTS', status: 409 });
  });

  it('invalid credentials returns AUTH_INVALID_CREDENTIALS', async () => {
    const email = `login+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    await request(baseUrl).post('/v1/auth/password/register').send({ email, password }).expect(200);

    const res = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password: `${password}-wrong` })
      .expect(401);

    expect(res.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: 401 });
  });

  it('request account deletion schedules deletion and cancel clears it', async () => {
    const email = `delete-me+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      accessToken: string;
    };

    await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const meAfterRequest = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    const userId = meAfterRequest.body.data.id as string;

    const emailJobsAfterRequest = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const deletionRequestedEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    const deletionReminderEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );

    expect(deletionRequestedEmail).toBeDefined();
    expect(deletionReminderEmail).toBeDefined();

    expect(meAfterRequest.body.data.accountDeletion).toBeDefined();
    expect(meAfterRequest.body.data.accountDeletion).toMatchObject({
      requestedAt: expect.any(String),
      scheduledFor: expect.any(String),
    });

    const requestedAt = new Date(meAfterRequest.body.data.accountDeletion.requestedAt as string);
    const scheduledFor = new Date(meAfterRequest.body.data.accountDeletion.scheduledFor as string);

    const msInDay = 24 * 60 * 60 * 1000;
    const deltaDays = (scheduledFor.getTime() - requestedAt.getTime()) / msInDay;
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);

    await request(baseUrl)
      .post('/v1/me/account-deletion/cancel')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const emailJobsAfterCancel = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const reminderStillPresent = emailJobsAfterCancel.some(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    expect(reminderStillPresent).toBe(false);

    const meAfterCancel = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meAfterCancel.body.data.accountDeletion).toBeNull();
  });

  it('request account deletion returns USERS_CANNOT_DELETE_LAST_ADMIN for last active admin', async () => {
    const email = `last-admin-delete+${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    await prisma.user.update({
      where: { id: reg.user.id },
      data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });

    // Ensure this user is the only active admin for a deterministic last-admin check.
    await prisma.user.updateMany({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        id: { not: reg.user.id },
      },
      data: { role: UserRole.USER },
    });

    const res = await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'USERS_CANNOT_DELETE_LAST_ADMIN', status: 409 });
  });
});
