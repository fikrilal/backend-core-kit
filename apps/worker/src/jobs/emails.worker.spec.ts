import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { EmailService } from '../../../../libs/platform/email/email.service';
import type { SendEmailInput } from '../../../../libs/platform/email/email.types';
import type { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import {
  AUTH_SEND_VERIFICATION_EMAIL_JOB,
  type AuthSendVerificationEmailJobData,
} from '../../../../libs/features/auth/infra/jobs/auth-email-verification.job';
import {
  AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
  type AuthSendPasswordResetEmailJobData,
} from '../../../../libs/features/auth/infra/jobs/auth-password-reset.job';
import { hashEmailVerificationToken } from '../../../../libs/features/auth/app/email-verification-token';
import { hashPasswordResetToken } from '../../../../libs/features/auth/app/password-reset-token';
import { EmailsWorker } from './emails.worker';

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

type ProcessFn = (job: Job<unknown, unknown>) => Promise<unknown>;

function getProcess(worker: EmailsWorker): ProcessFn {
  return (worker as unknown as { process: ProcessFn }).process.bind(worker as unknown as object);
}

function createLoggerStub(): PinoLogger {
  return {
    setContext: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  } as unknown as PinoLogger;
}

describe('EmailsWorker (unit)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores a hashed email verification token and never emails the hash', async () => {
    const verificationCreates: Array<{ data: { tokenHash: string; expiresAt: Date } }> = [];
    const sent: SendEmailInput[] = [];

    const client = {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: null,
        }),
      },
      emailVerificationToken: {
        create: async (args: { data: { tokenHash: string; expiresAt: Date } }) => {
          verificationCreates.push(args);
          return { id: 'evt-1' };
        },
      },
    };

    const prisma = { getClient: () => client } as unknown as PrismaService;
    const email = {
      isEnabled: () => true,
      send: async (input: SendEmailInput) => {
        sent.push(input);
        return { id: 'email-1' };
      },
    } as unknown as EmailService;

    const worker = new EmailsWorker(
      stubConfig({
        PUBLIC_APP_URL: 'https://app.example',
        AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60,
      }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      createLoggerStub(),
    );

    const job = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: {
        userId: 'user-1',
        requestedAt: new Date().toISOString(),
      } satisfies AuthSendVerificationEmailJobData,
    } as unknown as Job<unknown, unknown>;

    await getProcess(worker)(job);

    expect(verificationCreates).toHaveLength(1);
    expect(sent).toHaveLength(1);

    const text = sent[0]?.text;
    expect(typeof text).toBe('string');
    const lines = String(text).split('\n');
    const token = lines[2];
    expect(typeof token).toBe('string');
    expect(token).toBeTruthy();

    const tokenHash = verificationCreates[0]?.data.tokenHash;
    expect(typeof tokenHash).toBe('string');
    expect(tokenHash).toBe(hashEmailVerificationToken(token));
    expect(String(text)).not.toContain(tokenHash);

    const verifyUrlLine = lines.find((line) => line.startsWith('https://app.example/verify-email'));
    expect(verifyUrlLine).toBeTruthy();

    const verifyUrl = new URL(verifyUrlLine as string);
    expect(verifyUrl.origin).toBe('https://app.example');
    expect(verifyUrl.pathname).toBe('/verify-email');
    expect(verifyUrl.searchParams.get('token')).toBe(token);

    const html = sent[0]?.html;
    expect(typeof html).toBe('string');
    expect(String(html)).toContain(String(verifyUrl));
    expect(String(html)).toContain(token);
    expect(String(html)).not.toContain(tokenHash);

    expect(verificationCreates[0]?.data.expiresAt.toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });

  it('skips verification email for DELETED users (no token created, no email sent)', async () => {
    const verificationCreates: Array<{ data: { tokenHash: string; expiresAt: Date } }> = [];
    const sent: SendEmailInput[] = [];

    const client = {
      user: {
        findUnique: async () => ({
          id: 'user-deleted-1',
          email: 'deleted@example.com',
          emailVerifiedAt: null,
          status: 'DELETED',
        }),
      },
      emailVerificationToken: {
        create: async (args: { data: { tokenHash: string; expiresAt: Date } }) => {
          verificationCreates.push(args);
          return { id: 'evt-deleted-1' };
        },
      },
    };

    const prisma = { getClient: () => client } as unknown as PrismaService;
    const email = {
      isEnabled: () => true,
      send: async (input: SendEmailInput) => {
        sent.push(input);
        return { id: 'email-deleted-1' };
      },
    } as unknown as EmailService;

    const worker = new EmailsWorker(
      stubConfig({ AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      createLoggerStub(),
    );

    const job = {
      name: AUTH_SEND_VERIFICATION_EMAIL_JOB,
      data: {
        userId: 'user-deleted-1',
        requestedAt: new Date().toISOString(),
      } satisfies AuthSendVerificationEmailJobData,
    } as unknown as Job<unknown, unknown>;

    const res = await getProcess(worker)(job);

    expect(verificationCreates).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(res).toEqual({
      ok: true,
      userId: 'user-deleted-1',
      outcome: 'skipped',
      reason: 'already_deleted',
    });
  });

  it('stores a hashed password reset token and emails only the opaque token (link + fallback token)', async () => {
    const resetCreates: Array<{ data: { tokenHash: string; expiresAt: Date } }> = [];
    const sent: SendEmailInput[] = [];

    const client = {
      user: {
        findUnique: async () => ({
          id: 'user-2',
          email: 'user2@example.com',
        }),
      },
      passwordResetToken: {
        create: async (args: { data: { tokenHash: string; expiresAt: Date } }) => {
          resetCreates.push(args);
          return { id: 'prt-1' };
        },
      },
    };

    const prisma = { getClient: () => client } as unknown as PrismaService;
    const email = {
      isEnabled: () => true,
      send: async (input: SendEmailInput) => {
        sent.push(input);
        return { id: 'email-2' };
      },
    } as unknown as EmailService;

    const worker = new EmailsWorker(
      stubConfig({
        PUBLIC_APP_URL: 'https://app.example',
        AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: 1800,
      }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      createLoggerStub(),
    );

    const job = {
      name: AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
      data: {
        userId: 'user-2',
        requestedAt: new Date().toISOString(),
      } satisfies AuthSendPasswordResetEmailJobData,
    } as unknown as Job<unknown, unknown>;

    const res = await getProcess(worker)(job);

    expect(resetCreates).toHaveLength(1);
    expect(sent).toHaveLength(1);

    const text = sent[0]?.text;
    expect(typeof text).toBe('string');
    const lines = String(text).split('\n');
    const token = lines.at(-1);
    expect(typeof token).toBe('string');
    expect(token).toBeTruthy();

    const tokenHash = resetCreates[0]?.data.tokenHash;
    expect(typeof tokenHash).toBe('string');
    expect(tokenHash).toBe(hashPasswordResetToken(String(token)));
    expect(String(text)).not.toContain(tokenHash);

    const resetLink =
      typeof res === 'object' && res !== null && 'resetLink' in res
        ? (res as { resetLink?: unknown }).resetLink
        : undefined;
    expect(typeof resetLink).toBe('string');
    expect(String(resetLink)).toContain(String(token));
    expect(String(resetLink)).not.toContain(String(tokenHash));

    const url = new URL(String(resetLink));
    expect(url.origin).toBe('https://app.example');
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('token')).toBe(String(token));

    expect(resetCreates[0]?.data.expiresAt.toISOString()).toBe('2026-01-01T00:30:00.000Z');
  });

  it('skips password reset email for DELETED users (no token created, no email sent)', async () => {
    const resetCreates: Array<{ data: { tokenHash: string; expiresAt: Date } }> = [];
    const sent: SendEmailInput[] = [];

    const client = {
      user: {
        findUnique: async () => ({
          id: 'user-deleted-2',
          email: 'deleted2@example.com',
          status: 'DELETED',
        }),
      },
      passwordResetToken: {
        create: async (args: { data: { tokenHash: string; expiresAt: Date } }) => {
          resetCreates.push(args);
          return { id: 'prt-deleted-1' };
        },
      },
    };

    const prisma = { getClient: () => client } as unknown as PrismaService;
    const email = {
      isEnabled: () => true,
      send: async (input: SendEmailInput) => {
        sent.push(input);
        return { id: 'email-deleted-2' };
      },
    } as unknown as EmailService;

    const worker = new EmailsWorker(
      stubConfig({ AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: 1800 }),
      { isEnabled: () => true } as unknown as QueueWorkerFactory,
      prisma,
      email,
      createLoggerStub(),
    );

    const job = {
      name: AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
      data: {
        userId: 'user-deleted-2',
        requestedAt: new Date().toISOString(),
      } satisfies AuthSendPasswordResetEmailJobData,
    } as unknown as Job<unknown, unknown>;

    const res = await getProcess(worker)(job);

    expect(resetCreates).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(res).toEqual({
      ok: true,
      userId: 'user-deleted-2',
      outcome: 'skipped',
      reason: 'already_deleted',
    });
  });
});
