import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { UserRole, UserStatus } from '@prisma/client';
import {
  describeAuthE2eSuite,
  getSessionIdFromAccessToken,
  type AuthE2eHarness,
  uniqueEmail,
} from './auth-e2e.harness';

describeAuthE2eSuite('Auth Admin (e2e)', (harness) => {
  let baseUrl = '';
  let prisma: ReturnType<AuthE2eHarness['prisma']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
  });
  it('GET /v1/admin/whoami uses DB-hydrated roles (promotion takes effect immediately)', async () => {
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
});
