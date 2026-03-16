import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../../libs/features/auth/app/email-verification-token';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../../libs/features/auth/app/password-reset-token';
import { AUTH_SEND_VERIFICATION_EMAIL_JOB } from '../../libs/features/auth/infra/jobs/auth-email-verification.job';
import { AUTH_SEND_PASSWORD_RESET_EMAIL_JOB } from '../../libs/features/auth/infra/jobs/auth-password-reset.job';
import {
  describeAuthE2eSuite,
  getBodyData,
  getObjectField,
  getStringField,
  type AuthE2eHarness,
  uniqueEmail,
} from './auth-e2e.harness';

describeAuthE2eSuite('Auth Core (e2e)', (harness) => {
  let baseUrl = '';
  let prisma: ReturnType<AuthE2eHarness['prisma']>;
  let emailQueue: ReturnType<AuthE2eHarness['emailQueue']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
    emailQueue = harness.emailQueue();
  });
  it('GET /.well-known/jwks.json returns public keys', async () => {
    const res = await request(baseUrl).get('/.well-known/jwks.json').expect(200);
    expect(res.body).toHaveProperty('keys');
    expect(Array.isArray(res.body.keys)).toBe(true);
  });

  it('register -> refresh -> logout -> refresh fails', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    expect(getStringField(regUser, 'email')).toBe(email.toLowerCase());
    expect(regUser.emailVerified).toBe(false);
    expect(typeof reg.accessToken).toBe('string');
    expect(typeof reg.refreshToken).toBe('string');

    const refreshRes = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(reg, 'refreshToken') })
      .expect(200);

    const refreshed = getBodyData(refreshRes.body);

    expect(typeof refreshed.accessToken).toBe('string');
    expect(typeof refreshed.refreshToken).toBe('string');
    expect(getStringField(refreshed, 'refreshToken')).not.toBe(getStringField(reg, 'refreshToken'));

    await request(baseUrl)
      .post('/v1/auth/logout')
      .send({ refreshToken: getStringField(refreshed, 'refreshToken') })
      .expect(204);

    const afterLogout = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(refreshed, 'refreshToken') })
      .expect(401);

    expect(afterLogout.headers['content-type']).toContain('application/problem+json');
    expect(afterLogout.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });
  });

  it('refresh token reuse revokes the session (reuse detection)', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a', deviceName: 'Device A' })
      .expect(200);

    const reg = getBodyData(registerRes.body);

    const firstRefreshRes = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(reg, 'refreshToken') })
      .expect(200);

    const first = getBodyData(firstRefreshRes.body);
    expect(typeof first.refreshToken).toBe('string');
    expect(getStringField(first, 'refreshToken')).not.toBe(getStringField(reg, 'refreshToken'));

    const reuse = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(reg, 'refreshToken') })
      .expect(401);

    expect(reuse.headers['content-type']).toContain('application/problem+json');
    expect(reuse.body).toMatchObject({ code: 'AUTH_REFRESH_TOKEN_REUSED', status: 401 });

    const afterReuse = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(first, 'refreshToken') })
      .expect(401);

    expect(afterReuse.headers['content-type']).toContain('application/problem+json');
    expect(afterReuse.body).toMatchObject({ code: 'AUTH_SESSION_REVOKED', status: 401 });
  });

  it('register enqueues auth.sendVerificationEmail job when email is configured', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) =>
        job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB &&
        job.data.userId === getStringField(regUser, 'id'),
    );

    expect(jobForUser).toBeDefined();
  });

  it('POST /v1/auth/email/verify verifies email and is idempotent', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);
    const expiresAt = new Date(Date.now() + 60_000);

    await prisma.emailVerificationToken.create({
      data: { userId: getStringField(regUser, 'id'), tokenHash, expiresAt },
      select: { id: true },
    });

    await request(baseUrl).post('/v1/auth/email/verify').send({ token }).expect(204);

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(200);

    expect(meRes.body.data).toMatchObject({
      id: getStringField(regUser, 'id'),
      emailVerified: true,
    });

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
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);

    await prisma.emailVerificationToken.create({
      data: {
        userId: getStringField(regUser, 'id'),
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
      select: { id: true },
    });

    const res = await request(baseUrl).post('/v1/auth/email/verify').send({ token }).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'AUTH_EMAIL_VERIFICATION_TOKEN_EXPIRED', status: 400 });
  });

  it('POST /v1/auth/email/verification/resend enqueues a new verification email job and rate limits', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    // Drop the register enqueue so the test only sees the resend enqueue.
    await emailQueue.drain(true);

    await request(baseUrl)
      .post('/v1/auth/email/verification/resend')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(204);

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) =>
        job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB &&
        job.data.userId === getStringField(regUser, 'id'),
    );
    expect(jobForUser).toBeDefined();

    const rateLimited = await request(baseUrl)
      .post('/v1/auth/email/verification/resend')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('POST /v1/auth/password/reset/request returns 429 RATE_LIMITED when called too frequently', async () => {
    const email = uniqueEmail('auth');

    await request(baseUrl).post('/v1/auth/password/reset/request').send({ email }).expect(204);

    const rateLimited = await request(baseUrl)
      .post('/v1/auth/password/reset/request')
      .send({ email })
      .expect(429);

    expect(rateLimited.headers['content-type']).toContain('application/problem+json');
    expect(rateLimited.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('POST /v1/auth/password/reset/request enqueues auth.sendPasswordResetEmail job for existing user', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    // Drop the register enqueue so the test only sees the reset enqueue.
    await emailQueue.drain(true);

    await request(baseUrl)
      .post('/v1/auth/password/reset/request')
      .send({ email: email.toUpperCase() })
      .expect(204);

    const jobs = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const jobForUser = jobs.find(
      (job) =>
        job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB &&
        job.data.userId === getStringField(regUser, 'id'),
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
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';
    const newPassword = 'new-correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + 60_000);

    await prisma.passwordResetToken.create({
      data: { userId: getStringField(regUser, 'id'), tokenHash, expiresAt },
      select: { id: true },
    });

    await request(baseUrl)
      .post('/v1/auth/password/reset/confirm')
      .send({ token, newPassword })
      .expect(204);

    const oldRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(reg, 'refreshToken') })
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
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const regUser = getObjectField(reg, 'user');

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);

    await prisma.passwordResetToken.create({
      data: {
        userId: getStringField(regUser, 'id'),
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';
    const newPassword = 'new-correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password, deviceId: 'device-a' })
      .expect(200);

    const reg = getBodyData(registerRes.body);

    const loginRes = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password, deviceId: 'device-b' })
      .expect(200);

    const loggedIn = getBodyData(loginRes.body);

    const idemKey = randomUUID();
    await request(baseUrl)
      .post('/v1/auth/password/change')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .set('Idempotency-Key', idemKey)
      .send({ currentPassword: password, newPassword })
      .expect(204);

    const currentSessionRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(reg, 'refreshToken') })
      .expect(200);

    expect(typeof currentSessionRefresh.body.data.refreshToken).toBe('string');

    const replayed = await request(baseUrl)
      .post('/v1/auth/password/change')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .set('Idempotency-Key', idemKey)
      .send({ currentPassword: password, newPassword })
      .expect(204);

    expect(replayed.headers['idempotency-replayed']).toBe('true');

    const otherSessionRefresh = await request(baseUrl)
      .post('/v1/auth/refresh')
      .send({ refreshToken: getStringField(loggedIn, 'refreshToken') })
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

  it('duplicate register returns AUTH_EMAIL_ALREADY_EXISTS', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    await request(baseUrl).post('/v1/auth/password/register').send({ email, password }).expect(200);

    const res = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(409);

    expect(res.body).toMatchObject({ code: 'AUTH_EMAIL_ALREADY_EXISTS', status: 409 });
  });

  it('invalid credentials returns AUTH_INVALID_CREDENTIALS', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    await request(baseUrl).post('/v1/auth/password/register').send({ email, password }).expect(200);

    const res = await request(baseUrl)
      .post('/v1/auth/password/login')
      .send({ email, password: `${password}-wrong` })
      .expect(401);

    expect(res.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: 401 });
  });
});
