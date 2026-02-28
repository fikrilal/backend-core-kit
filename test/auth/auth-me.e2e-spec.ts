import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  describeAuthE2eSuite,
  expectObjectDeleted,
  getSessionIdFromAccessToken,
  type AuthE2eHarness,
  uniqueEmail,
} from './auth-e2e.harness';

describeAuthE2eSuite('Auth Me Profile Sessions (e2e)', (harness) => {
  let baseUrl = '';
  let prisma: ReturnType<AuthE2eHarness['prisma']>;
  let s3: ReturnType<AuthE2eHarness['s3']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
    s3 = harness.s3();
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
    const email = uniqueEmail('auth');
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
});
