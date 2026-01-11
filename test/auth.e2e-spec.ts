import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApiApp } from '../apps/api/src/bootstrap';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const hasDeps =
  typeof databaseUrl === 'string' &&
  databaseUrl !== '' &&
  typeof redisUrl === 'string' &&
  redisUrl !== '';

(hasDeps ? describe : describe.skip)('Auth (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let baseUrl: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for Auth (e2e) tests');
    }

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();

    app = await createApiApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
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

  it('GET /v1/me requires an access token', async () => {
    const res = await request(baseUrl).get('/v1/me').expect(401);
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

    const promoted = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);

    expect(promoted.body.data).toMatchObject({ id: userReg.user.id, roles: ['ADMIN'] });

    const promoteTraceId = promoted.headers['x-request-id'];
    expect(typeof promoteTraceId).toBe('string');

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

    const selfDemoted = await request(baseUrl)
      .patch(`/v1/admin/users/${adminReg.user.id}/role`)
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .send({ role: 'USER' })
      .expect(200);

    expect(selfDemoted.body.data).toMatchObject({ id: adminReg.user.id, roles: ['USER'] });

    const selfDemoteTraceId = selfDemoted.headers['x-request-id'];
    expect(typeof selfDemoteTraceId).toBe('string');

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

    const lastAdminBlocked = await request(baseUrl)
      .patch(`/v1/admin/users/${userReg.user.id}/role`)
      .set('Authorization', `Bearer ${userReg.accessToken}`)
      .send({ role: 'USER' })
      .expect(409);

    expect(lastAdminBlocked.headers['content-type']).toContain('application/problem+json');
    expect(lastAdminBlocked.body).toMatchObject({
      code: 'ADMIN_CANNOT_DEMOTE_LAST_ADMIN',
      status: 409,
    });

    const lastAdminTraceId = lastAdminBlocked.headers['x-request-id'];
    expect(typeof lastAdminTraceId).toBe('string');

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
