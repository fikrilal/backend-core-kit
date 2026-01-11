import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from '../../../../libs/platform/email/email.service';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import {
  AUTH_SEND_VERIFICATION_EMAIL_JOB,
  EMAIL_QUEUE,
  type AuthSendVerificationEmailJobData,
} from '../../../../libs/features/auth/infra/jobs/auth-email-verification.job';
import {
  AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
  type AuthSendPasswordResetEmailJobData,
} from '../../../../libs/features/auth/infra/jobs/auth-password-reset.job';
import {
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../../../../libs/features/auth/app/email-verification-token';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../../../../libs/features/auth/app/password-reset-token';

type AuthSendVerificationEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'already_verified';
  emailId?: string;
  tokenExpiresAt?: string;
}> &
  JsonObject;

type AuthSendPasswordResetEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found';
  emailId?: string;
  tokenExpiresAt?: string;
  resetLink?: string;
}> &
  JsonObject;

type AuthEmailsJobData = AuthSendVerificationEmailJobData | AuthSendPasswordResetEmailJobData;

type AuthEmailsJobResult = AuthSendVerificationEmailJobResult | AuthSendPasswordResetEmailJobResult;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

@Injectable()
export class AuthEmailsWorker implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly workers: QueueWorkerFactory,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthEmailsWorker.name);
  }

  async onModuleInit(): Promise<void> {
    // Keep the worker process runnable in dev/test without Redis/DB/email unless configured.
    if (!this.workers.isEnabled() || !this.prisma.isEnabled() || !this.email.isEnabled()) return;

    this.workers.createWorker<AuthEmailsJobData, AuthEmailsJobResult>(
      EMAIL_QUEUE,
      async (job) => this.process(job),
      { concurrency: 5 },
    );
  }

  private async process(
    job: Job<AuthEmailsJobData, AuthEmailsJobResult>,
  ): Promise<AuthEmailsJobResult> {
    if (job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB) {
      return await this.processVerificationEmail(job.data.userId);
    }

    if (job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB) {
      return await this.processPasswordResetEmail(job.data.userId);
    }

    throw new Error(`Unknown job name "${job.name}" on queue "${EMAIL_QUEUE}"`);
  }

  private async processVerificationEmail(
    userId: string,
  ): Promise<AuthSendVerificationEmailJobResult> {
    const now = new Date();
    const ttlSeconds =
      this.config.get<number>('AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS') ?? 86400;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Verification email job skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    if (user.emailVerifiedAt) {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_verified' };
    }

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);

    await client.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });

    const text = `Use this token to verify your email:\n\n${token}\n\nThis token expires at ${expiresAt.toISOString()}.`;

    const sent = await this.email.send({
      to: user.email,
      subject: 'Verify your email',
      text,
    });

    this.logger.info({ userId: user.id, emailId: sent.id }, 'Sent verification email');

    return {
      ok: true,
      userId: user.id,
      outcome: 'sent',
      emailId: sent.id,
      tokenExpiresAt: expiresAt.toISOString(),
    };
  }

  private async processPasswordResetEmail(
    userId: string,
  ): Promise<AuthSendPasswordResetEmailJobResult> {
    const now = new Date();
    const ttlSeconds = this.config.get<number>('AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS') ?? 1800;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Password reset email job skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    const publicAppUrl = asNonEmptyString(this.config.get<string>('PUBLIC_APP_URL'));
    if (!publicAppUrl) {
      throw new Error('PUBLIC_APP_URL is not configured');
    }

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);

    await client.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });

    const resetUrl = new URL('/reset-password', publicAppUrl);
    resetUrl.searchParams.set('token', token);

    const text = [
      'Reset your password',
      '',
      `Open this link to reset your password (expires at ${expiresAt.toISOString()}):`,
      resetUrl.toString(),
      '',
      'If the link does not work, you can paste this token into the app:',
      token,
    ].join('\n');

    const sent = await this.email.send({
      to: user.email,
      subject: 'Reset your password',
      text,
    });

    this.logger.info({ userId: user.id, emailId: sent.id }, 'Sent password reset email');

    return {
      ok: true,
      userId: user.id,
      outcome: 'sent',
      emailId: sent.id,
      tokenExpiresAt: expiresAt.toISOString(),
      resetLink: resetUrl.toString(),
    };
  }
}
