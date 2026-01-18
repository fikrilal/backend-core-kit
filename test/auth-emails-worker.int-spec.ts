import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../libs/platform/db/prisma.service';
import type { EmailService } from '../libs/platform/email/email.service';
import type { QueueWorkerFactory } from '../libs/platform/queue/queue.worker';
import { AUTH_SEND_VERIFICATION_EMAIL_JOB } from '../libs/features/auth/infra/jobs/auth-email-verification.job';
import { AuthEmailsWorker } from '../apps/worker/src/jobs/auth-email-verification.worker';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

type ProcessFn = (job: Job<unknown, unknown>) => Promise<unknown>;

function getProcess(worker: AuthEmailsWorker): ProcessFn {
  return (worker as unknown as { process: ProcessFn }).process.bind(worker as unknown as object);
}

(shouldSkip ? describe.skip : describe)('AuthEmailsWorker (int)', () => {
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

  it('does not register a worker when email is disabled', async () => {
    const workers: QueueWorkerFactory = {
      isEnabled: () => true,
      createWorker: jest.fn(),
    } as unknown as QueueWorkerFactory;

    const email: EmailService = {
      isEnabled: () => false,
    } as unknown as EmailService;

    const worker = new AuthEmailsWorker(
      stubConfig({}),
      workers,
      { isEnabled: () => true } as unknown as PrismaService,
      email,
      { setContext: () => undefined } as unknown as PinoLogger,
    );

    await worker.onModuleInit();
    expect(workers.createWorker).not.toHaveBeenCalled();
  });

  it('skips verification email jobs when the user does not exist', async () => {
    const email: EmailService = {
      isEnabled: () => true,
      send: jest.fn(),
    } as unknown as EmailService;

    const worker = new AuthEmailsWorker(
      stubConfig({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      {
        setContext: () => undefined,
        warn: () => undefined,
        info: () => undefined,
      } as unknown as PinoLogger,
    );

    const userId = randomUUID();
    const job = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId, requestedAt: new Date().toISOString() },
    } as unknown as Job<unknown, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      userId,
      outcome: 'skipped',
      reason: 'user_not_found',
    });

    expect(email.send).not.toHaveBeenCalled();
  });

  it('skips verification email jobs when the user is already verified', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: {
        email: `verified+${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    createdUserIds.push(user.id);

    const email: EmailService = {
      isEnabled: () => true,
      send: jest.fn(),
    } as unknown as EmailService;

    const worker = new AuthEmailsWorker(
      stubConfig({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      { setContext: () => undefined, info: () => undefined } as unknown as PinoLogger,
    );

    const job = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId: user.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<unknown, unknown>;

    await expect(getProcess(worker)(job)).resolves.toMatchObject({
      ok: true,
      userId: user.id,
      outcome: 'skipped',
      reason: 'already_verified',
    });

    expect(email.send).not.toHaveBeenCalled();

    const tokens = await client.emailVerificationToken.count({ where: { userId: user.id } });
    expect(tokens).toBe(0);
  });

  it('creates a verification token and sends an email for unverified users', async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: {
        email: `unverified+${randomUUID()}@example.com`,
        emailVerifiedAt: null,
      },
      select: { id: true, email: true },
    });
    createdUserIds.push(user.id);

    const email: EmailService = {
      isEnabled: () => true,
      send: jest.fn(async () => ({ id: `email-${randomUUID()}` })),
    } as unknown as EmailService;

    const worker = new AuthEmailsWorker(
      stubConfig({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      { setContext: () => undefined, info: () => undefined } as unknown as PinoLogger,
    );

    const job = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId: user.id, requestedAt: new Date().toISOString() },
    } as unknown as Job<unknown, unknown>;

    const res = await getProcess(worker)(job);
    expect(res).toMatchObject({ ok: true, userId: user.id, outcome: 'sent' });

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Verify your email',
      }),
    );

    const tokens = await client.emailVerificationToken.findMany({
      where: { userId: user.id },
      select: { expiresAt: true },
    });
    expect(tokens).toHaveLength(1);

    const ttlMs = tokens[0]?.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(60_000);
  });
});
