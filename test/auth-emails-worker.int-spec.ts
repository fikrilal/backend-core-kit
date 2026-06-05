import { randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../libs/platform/db/prisma.service';
import { EmailService } from '../libs/platform/email/email.service';
import { QueueWorkerFactory } from '../libs/platform/queue/queue.worker';
import { AUTH_SEND_VERIFICATION_EMAIL_JOB } from '../libs/features/auth/infra/jobs/auth-email-verification.job';
import { EmailsWorker } from '../apps/worker/src/jobs/emails.worker';
import { bindInstanceMethod, createConfigService, createPrototypeStub } from './support/stubs';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

type EmailsJobLike = Readonly<{ name: string; data: { userId: string; requestedAt: string } }>;

function getProcess(worker: EmailsWorker) {
  return bindInstanceMethod(worker, 'process');
}

(shouldSkip ? describe.skip : describe)('EmailsWorker (int)', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(
      createConfigService({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }),
    );
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
    const workers = createPrototypeStub(QueueWorkerFactory, {
      isEnabled: () => true,
      createWorker: jest.fn(),
    });

    const email = createPrototypeStub(EmailService, {
      isEnabled: () => false,
    });

    const worker = new EmailsWorker(
      createConfigService({}),
      workers,
      createPrototypeStub(PrismaService, { isEnabled: () => true }),
      email,
      createPrototypeStub(PinoLogger, { setContext: () => undefined }),
    );

    await worker.onModuleInit();
    expect(workers.createWorker).not.toHaveBeenCalled();
  });

  it('skips verification email jobs when the user does not exist', async () => {
    const email = createPrototypeStub(EmailService, {
      isEnabled: () => true,
      send: jest.fn(),
    });

    const worker = new EmailsWorker(
      createConfigService({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      createPrototypeStub(QueueWorkerFactory, { isEnabled: () => true }),
      prisma,
      email,
      createPrototypeStub(PinoLogger, {
        setContext: () => undefined,
        warn: () => undefined,
        info: () => undefined,
      }),
    );

    const userId = randomUUID();
    const job: EmailsJobLike = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId, requestedAt: new Date().toISOString() },
    };

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

    const email = createPrototypeStub(EmailService, {
      isEnabled: () => true,
      send: jest.fn(),
    });

    const worker = new EmailsWorker(
      createConfigService({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      createPrototypeStub(QueueWorkerFactory, { isEnabled: () => true }),
      prisma,
      email,
      createPrototypeStub(PinoLogger, { setContext: () => undefined, info: () => undefined }),
    );

    const job: EmailsJobLike = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId: user.id, requestedAt: new Date().toISOString() },
    };

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

    const email = createPrototypeStub(EmailService, {
      isEnabled: () => true,
      send: jest.fn(async () => ({ id: `email-${randomUUID()}` })),
    });

    const worker = new EmailsWorker(
      createConfigService({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      createPrototypeStub(QueueWorkerFactory, { isEnabled: () => true }),
      prisma,
      email,
      createPrototypeStub(PinoLogger, { setContext: () => undefined, info: () => undefined }),
    );

    const job: EmailsJobLike = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: { userId: user.id, requestedAt: new Date().toISOString() },
    };

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
