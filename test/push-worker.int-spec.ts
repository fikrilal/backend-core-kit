import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { UserStatus } from '@prisma/client';
import type { PushService } from '../libs/platform/push/push.service';
import type { PushSendJobData } from '../libs/platform/push/push.job';
import { PUSH_SEND_JOB } from '../libs/platform/push/push.job';
import { PushErrorCode, PushSendError } from '../libs/platform/push/push.types';
import { PrismaService } from '../libs/platform/db/prisma.service';
import { PushWorker } from '../apps/worker/src/jobs/push.worker';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

type ProcessFn = (job: Job<PushSendJobData, unknown>) => Promise<unknown>;

function getProcess(worker: PushWorker): ProcessFn {
  return (worker as unknown as { process: ProcessFn }).process.bind(worker as unknown as object);
}

(shouldSkip ? describe.skip : describe)('PushWorker (int)', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(stubConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }));
    await prisma.ping();
  });

  afterEach(async () => {
    const client = prisma.getClient();
    while (createdUserIds.length) {
      const userId = createdUserIds.pop();
      if (!userId) continue;
      await client.user.deleteMany({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('skips revoked sessions', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-revoked+${randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        pushToken: `fcm-${randomUUID()}`,
      },
      select: { id: true },
    });

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'session_revoked',
    });

    expect(push.sendToToken).not.toHaveBeenCalled();
  });

  it('skips expired sessions', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-expired+${randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() - 1_000),
        pushToken: `fcm-${randomUUID()}`,
      },
      select: { id: true },
    });

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'session_expired',
    });

    expect(push.sendToToken).not.toHaveBeenCalled();
  });

  it('skips inactive users', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-inactive+${randomUUID()}@example.com`, status: UserStatus.SUSPENDED },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        pushToken: `fcm-${randomUUID()}`,
      },
      select: { id: true },
    });

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'user_inactive',
    });

    expect(push.sendToToken).not.toHaveBeenCalled();
  });

  it('skips sessions with no push token', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-no-token+${randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'no_token',
    });

    expect(push.sendToToken).not.toHaveBeenCalled();
  });

  it('clears invalid push tokens when unchanged', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-invalid+${randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const token = `fcm-${randomUUID()}`;
    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        pushToken: token,
      },
      select: { id: true },
    });

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(async () => {
        throw new PushSendError({
          provider: 'test',
          message: 'invalid token',
          retryable: false,
          code: PushErrorCode.InvalidToken,
        });
      }),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'invalid_token',
      providerCode: 'push/invalid-token',
    });

    const after = await client.session.findUnique({
      where: { id: session.id },
      select: { pushToken: true, pushTokenRevokedAt: true, pushTokenUpdatedAt: true },
    });

    expect(after?.pushToken).toBeNull();
    expect(after?.pushTokenRevokedAt).toBeInstanceOf(Date);
    expect(after?.pushTokenUpdatedAt).toBeInstanceOf(Date);
  });

  it('does not clear tokens when they changed during send (WHERE pushToken = token)', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: { email: `push-race+${randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const token = `fcm-${randomUUID()}`;
    const session = await client.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        pushToken: token,
      },
      select: { id: true },
    });

    const nextToken = `fcm-${randomUUID()}`;

    const push: PushService = {
      isEnabled: () => true,
      sendToToken: jest.fn(async () => {
        await client.session.update({
          where: { id: session.id },
          data: { pushToken: nextToken, pushTokenUpdatedAt: new Date() },
        });

        throw new PushSendError({
          provider: 'test',
          message: 'invalid token',
          retryable: false,
          code: PushErrorCode.InvalidToken,
          providerCode: 'messaging/registration-token-not-registered',
        });
      }),
    };

    const worker = new PushWorker({ isEnabled: () => true } as unknown as never, push, prisma, {
      setContext: () => undefined,
      info: () => undefined,
    } as unknown as never);

    const job = {
      name: PUSH_SEND_JOB,
      data: { sessionId: session.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<PushSendJobData, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      sessionId: session.id,
      outcome: 'skipped',
      reason: 'invalid_token',
      providerCode: 'messaging/registration-token-not-registered',
    });

    const after = await client.session.findUnique({
      where: { id: session.id },
      select: { pushToken: true, pushTokenRevokedAt: true },
    });

    expect(after?.pushToken).toBe(nextToken);
    expect(after?.pushTokenRevokedAt).toBeNull();
  });
});
