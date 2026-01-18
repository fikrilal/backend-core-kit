import { randomUUID } from 'crypto';
import { QueueEvents } from 'bullmq';
import request from 'supertest';
import { createApiApp } from '../apps/api/src/bootstrap';
import { createWorkerApp } from '../apps/worker/src/bootstrap';
import { jobName } from '../libs/platform/queue/job-name';
import { QueueProducer } from '../libs/platform/queue/queue.producer';
import { queueName } from '../libs/platform/queue/queue-name';
import { PrismaService } from '../libs/platform/db/prisma.service';
import {
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  ExternalIdentityProvider,
  FilePurpose,
  FileStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  deleteStoredFileJobId,
  expireUploadJobId,
  USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB,
  USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB,
  type UsersProfileImageDeleteStoredFileJobData,
  type UsersProfileImageExpireUploadJobData,
} from '../libs/features/users/infra/jobs/profile-image-cleanup.job';
import {
  finalizeAccountDeletionJobId,
  USERS_FINALIZE_ACCOUNT_DELETION_JOB,
  USERS_QUEUE,
  type UsersFinalizeAccountDeletionJobData,
} from '../libs/features/users/infra/jobs/user-account-deletion.job';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const storageEndpoint = process.env.STORAGE_S3_ENDPOINT?.trim();
const storageRegion = process.env.STORAGE_S3_REGION?.trim();
const storageBucket = process.env.STORAGE_S3_BUCKET?.trim();
const storageAccessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID?.trim();
const storageSecretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
const storageForcePathStyle = process.env.STORAGE_S3_FORCE_PATH_STYLE?.trim();

const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkipDepsTests = skipDepsTests || !databaseUrl || !redisUrl;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFoundError(err: unknown): boolean {
  if (!isRecord(err)) return false;

  const name = typeof err.name === 'string' ? err.name : undefined;
  if (name === 'NotFound' || name === 'NoSuchKey') return true;

  const metadata = err.$metadata;
  if (isRecord(metadata) && typeof metadata.httpStatusCode === 'number') {
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

async function waitForReady(baseUrl: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | undefined;

  while (Date.now() < deadline) {
    const res = await request(baseUrl).get('/ready');
    lastStatus = res.status;
    if (res.status === 200) return;
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`Timed out waiting for /ready (last status: ${lastStatus ?? 'unknown'})`);
}

(shouldSkipDepsTests ? describe.skip : describe)('Queue smoke (int)', () => {
  let apiApp: Awaited<ReturnType<typeof createApiApp>>;
  let workerApp: Awaited<ReturnType<typeof createWorkerApp>>;
  let workerBaseUrl: string;
  let producer: QueueProducer;
  let prisma: PrismaService;
  let s3: S3Client;
  let bucket: string;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is required for Queue smoke (int) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
      );
    }
    if (!redisUrl) {
      throw new Error(
        'REDIS_URL is required for Queue smoke (int) tests (set DATABASE_URL/REDIS_URL or set SKIP_DEPS_TESTS=true to skip)',
      );
    }

    process.env.STORAGE_S3_ENDPOINT ??= storageEndpoint ?? 'http://127.0.0.1:59090';
    process.env.STORAGE_S3_REGION ??= storageRegion ?? 'us-east-1';
    process.env.STORAGE_S3_BUCKET ??= storageBucket ?? 'backend-core-kit';
    process.env.STORAGE_S3_ACCESS_KEY_ID ??= storageAccessKeyId ?? 'minioadmin';
    process.env.STORAGE_S3_SECRET_ACCESS_KEY ??= storageSecretAccessKey ?? 'minioadmin';
    process.env.STORAGE_S3_FORCE_PATH_STYLE ??= storageForcePathStyle ?? 'true';

    bucket = process.env.STORAGE_S3_BUCKET ?? 'backend-core-kit';
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
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      // ignore (bucket may already exist)
    }

    workerApp = await createWorkerApp();
    await workerApp.listen({ port: 0, host: '127.0.0.1' });
    workerBaseUrl = await workerApp.getUrl();

    apiApp = await createApiApp();
    producer = apiApp.get(QueueProducer);
    prisma = apiApp.get(PrismaService);

    await waitForReady(workerBaseUrl);
  });

  afterAll(async () => {
    await apiApp.close();
    await workerApp.close();
    s3.destroy();
  });

  it('Worker health endpoints return ok', async () => {
    const healthRes = await request(workerBaseUrl).get('/health').expect(200);
    expect(healthRes.headers['x-request-id']).toBeDefined();
    expect(healthRes.body).toEqual({ status: 'ok' });

    const readyRes = await request(workerBaseUrl).get('/ready').expect(200);
    expect(readyRes.headers['x-request-id']).toBeDefined();
    expect(readyRes.body).toEqual({ status: 'ok' });
  });

  it('Processes system.smoke job and touches Postgres', async () => {
    const systemQueue = queueName('system');
    const smokeJob = jobName('system.smoke');

    const queueEvents = new QueueEvents(systemQueue, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const runId = randomUUID();
      const job = await producer.enqueue(
        systemQueue,
        smokeJob,
        { runId, requestedAt: new Date().toISOString() },
        { jobId: `system.smoke-${runId}` },
      );
      const result = await job.waitUntilFinished(queueEvents, 20_000);
      expect(result).toEqual({ ok: true, runId, db: 'ok' });
    } finally {
      await queueEvents.close();
    }
  });

  it('Retries system.smokeRetry with backoff, then succeeds', async () => {
    const systemQueue = queueName('system');
    const smokeRetryJob = jobName('system.smokeRetry');

    const queueEvents = new QueueEvents(systemQueue, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const runId = randomUUID();
      const startedAt = Date.now();
      const job = await producer.enqueue(
        systemQueue,
        smokeRetryJob,
        { runId, requestedAt: new Date().toISOString() },
        {
          jobId: `system.smokeRetry-${runId}`,
          attempts: 2,
          backoff: { type: 'fixed', delay: 750 },
        },
      );
      const result = await job.waitUntilFinished(queueEvents, 20_000);
      const elapsedMs = Date.now() - startedAt;

      expect(result).toEqual({ ok: true, runId, db: 'ok', attemptsMade: 1 });
      expect(elapsedMs).toBeGreaterThanOrEqual(600);
    } finally {
      await queueEvents.close();
    }
  });

  it('Finalizes users.finalizeAccountDeletion and de-identifies user data', async () => {
    const client = prisma.getClient();

    const now = new Date();
    const runId = randomUUID();
    const email = `acct-delete+${runId}@example.com`;
    const tokenHash = `hash_${runId}`;

    const created = await client.user.create({
      data: {
        email,
        emailVerifiedAt: now,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        profile: { create: { displayName: 'Delete Me', givenName: 'Delete', familyName: 'Me' } },
        passwordCredential: { create: { passwordHash: 'test_hash' } },
        externalIdentities: {
          create: {
            provider: ExternalIdentityProvider.GOOGLE,
            subject: `sub_${runId}`,
            email,
          },
        },
        emailVerificationTokens: { create: { tokenHash: `${tokenHash}_verify`, expiresAt: now } },
        passwordResetTokens: { create: { tokenHash: `${tokenHash}_reset`, expiresAt: now } },
      },
      select: { id: true },
    });

    const session = await client.session.create({
      data: {
        userId: created.id,
        deviceId: `device_${runId}`,
        deviceName: 'Test Device',
        activeKey: `active_${runId}`,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        refreshTokens: { create: { tokenHash: `${tokenHash}_refresh`, expiresAt: now } },
      },
      select: { id: true },
    });

    const requestedAt = new Date(now.getTime() - 60_000);
    const scheduledFor = new Date(now.getTime() - 1_000);

    await client.user.update({
      where: { id: created.id },
      data: {
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
        deletionRequestedSessionId: session.id,
        deletionRequestedTraceId: `trace_${runId}`,
      },
      select: { id: true },
    });

    const queueEvents = new QueueEvents(USERS_QUEUE, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const jobData: UsersFinalizeAccountDeletionJobData = {
        userId: created.id,
        scheduledFor: scheduledFor.toISOString(),
        enqueuedAt: now.toISOString(),
      };
      const job = await producer.enqueue(
        USERS_QUEUE,
        USERS_FINALIZE_ACCOUNT_DELETION_JOB,
        jobData,
        {
          jobId: finalizeAccountDeletionJobId(created.id),
        },
      );

      const result = await job.waitUntilFinished(queueEvents, 20_000);
      expect(result).toMatchObject({ ok: true, userId: created.id, outcome: 'finalized' });
    } finally {
      await queueEvents.close();
    }

    const after = await client.user.findUnique({
      where: { id: created.id },
      select: {
        email: true,
        emailVerifiedAt: true,
        role: true,
        status: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        deletionRequestedSessionId: true,
        deletionRequestedTraceId: true,
        deletedAt: true,
      },
    });

    expect(after).toBeTruthy();
    expect(after).toMatchObject({
      email: `deleted+${created.id}@example.invalid`,
      emailVerifiedAt: null,
      role: UserRole.USER,
      status: UserStatus.DELETED,
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionRequestedSessionId: null,
      deletionRequestedTraceId: null,
      deletedAt: expect.any(Date),
    });

    const profile = await client.userProfile.findUnique({
      where: { userId: created.id },
      select: { displayName: true, givenName: true, familyName: true },
    });
    expect(profile).toMatchObject({ displayName: null, givenName: null, familyName: null });

    const [passwordCredential, externalIdentities, emailTokens, resetTokens, sessions] =
      await Promise.all([
        client.passwordCredential.findUnique({ where: { userId: created.id } }),
        client.externalIdentity.findMany({ where: { userId: created.id } }),
        client.emailVerificationToken.findMany({ where: { userId: created.id } }),
        client.passwordResetToken.findMany({ where: { userId: created.id } }),
        client.session.findMany({ where: { userId: created.id } }),
      ]);

    expect(passwordCredential).toBeNull();
    expect(externalIdentities).toHaveLength(0);
    expect(emailTokens).toHaveLength(0);
    expect(resetTokens).toHaveLength(0);
    expect(sessions).toHaveLength(0);

    const [statusAudit, deletionAudit] = await Promise.all([
      client.userStatusChangeAudit.findFirst({
        where: { targetUserId: created.id, newStatus: UserStatus.DELETED },
      }),
      client.userAccountDeletionAudit.findFirst({
        where: { targetUserId: created.id, action: 'FINALIZED' },
      }),
    ]);

    expect(statusAudit).toMatchObject({
      actorUserId: created.id,
      actorSessionId: session.id,
      targetUserId: created.id,
      oldStatus: UserStatus.ACTIVE,
      newStatus: UserStatus.DELETED,
      traceId: `trace_${runId}`,
    });
    expect(deletionAudit).toMatchObject({
      actorUserId: created.id,
      actorSessionId: session.id,
      targetUserId: created.id,
      action: 'FINALIZED',
      traceId: `trace_${runId}`,
    });
  });

  it('Deletes users.profileImage.deleteStoredFile objects and marks stored files deleted', async () => {
    const client = prisma.getClient();
    const now = new Date();
    const runId = randomUUID();

    const user = await client.user.create({
      data: {
        email: `profile-image-delete+${runId}@example.com`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });

    const fileId = randomUUID();
    const objectKey = `users/${user.id}/profile-images/${fileId}`;
    const contentType = 'image/png';
    const body = Buffer.from(`profile-image-${runId}`, 'utf8');

    await client.storedFile.create({
      data: {
        id: fileId,
        ownerUserId: user.id,
        purpose: FilePurpose.PROFILE_IMAGE,
        status: FileStatus.ACTIVE,
        bucket,
        objectKey,
        contentType,
        sizeBytes: body.length,
        traceId: `trace_${runId}`,
        uploadedAt: now,
      },
      select: { id: true },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    const queueEvents = new QueueEvents(USERS_QUEUE, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const jobData: UsersProfileImageDeleteStoredFileJobData = {
        fileId,
        ownerUserId: user.id,
        enqueuedAt: now.toISOString(),
      };
      const job = await producer.enqueue(
        USERS_QUEUE,
        USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB,
        jobData,
        { jobId: deleteStoredFileJobId(fileId) },
      );

      const result = await job.waitUntilFinished(queueEvents, 20_000);
      expect(result).toEqual({ ok: true, fileId, outcome: 'deleted' });
    } finally {
      await queueEvents.close();
    }

    await expectObjectDeleted(s3, bucket, objectKey);

    const storedFile = await client.storedFile.findUnique({
      where: { id: fileId },
      select: { status: true, deletedAt: true },
    });

    expect(storedFile).toMatchObject({ status: FileStatus.DELETED, deletedAt: expect.any(Date) });
  });

  it('Expires users.profileImage.expireUpload uploads and marks stored files deleted', async () => {
    const client = prisma.getClient();
    const now = new Date();
    const runId = randomUUID();

    const user = await client.user.create({
      data: {
        email: `profile-image-expire+${runId}@example.com`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });

    const fileId = randomUUID();
    const objectKey = `users/${user.id}/profile-images/${fileId}`;
    const contentType = 'image/png';
    const body = Buffer.from(`profile-image-expire-${runId}`, 'utf8');

    await client.storedFile.create({
      data: {
        id: fileId,
        ownerUserId: user.id,
        purpose: FilePurpose.PROFILE_IMAGE,
        status: FileStatus.UPLOADING,
        bucket,
        objectKey,
        contentType,
        sizeBytes: body.length,
        traceId: `trace_${runId}`,
      },
      select: { id: true },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    const queueEvents = new QueueEvents(USERS_QUEUE, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const jobData: UsersProfileImageExpireUploadJobData = {
        fileId,
        ownerUserId: user.id,
        enqueuedAt: now.toISOString(),
        expiresAt: now.toISOString(),
      };
      const job = await producer.enqueue(
        USERS_QUEUE,
        USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB,
        jobData,
        { jobId: expireUploadJobId(fileId) },
      );

      const result = await job.waitUntilFinished(queueEvents, 20_000);
      expect(result).toMatchObject({ ok: true, fileId, outcome: 'expired' });
    } finally {
      await queueEvents.close();
    }

    await expectObjectDeleted(s3, bucket, objectKey);

    const storedFile = await client.storedFile.findUnique({
      where: { id: fileId },
      select: { status: true, deletedAt: true },
    });

    expect(storedFile).toMatchObject({ status: FileStatus.DELETED, deletedAt: expect.any(Date) });
  });
});
