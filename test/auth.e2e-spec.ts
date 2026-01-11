import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApiApp } from '../apps/api/src/bootstrap';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';
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
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../libs/features/auth/app/email-verification-token';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../libs/features/auth/app/password-reset-token';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

(skipDepsTests ? describe.skip : describe)('Auth (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let baseUrl: string;
  let prisma: PrismaClient;
  let emailQueue: Queue<AuthSendVerificationEmailJobData | AuthSendPasswordResetEmailJobData>;

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

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();

    emailQueue = new Queue<AuthSendVerificationEmailJobData | AuthSendPasswordResetEmailJobData>(
      EMAIL_QUEUE,
      {
        connection: { url: redisUrl },
      },
    );
    await emailQueue.drain(true);

    app = await createApiApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await emailQueue.drain(true);
  });

  afterAll(async () => {
    await emailQueue.drain(true);
    await emailQueue.close();
    await prisma.$disconnect();
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
      user: { id: string; email: string; emailVerified: boolean };
      accessToken: string;
      refreshToken: string;
    };

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meRes.body.data).toMatchObject({
      id: reg.user.id,
      email: email.toLowerCase(),
      emailVerified: false,
      roles: ['USER'],
      profile: { displayName: null, givenName: null, familyName: null },
    });
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
      accessToken: string;
      refreshToken: string;
    };

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
      profile: { displayName: 'Dante', givenName: 'Dante', familyName: 'Alighieri' },
    });

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meRes.body.data.profile).toEqual({
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
});
