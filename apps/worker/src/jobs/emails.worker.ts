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
import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
  type UsersSendAccountDeletionReminderEmailJobData,
  type UsersSendAccountDeletionRequestedEmailJobData,
} from '../../../../libs/features/users/infra/jobs/user-account-deletion-email.job';
import {
  buildVerifyEmailUrl,
  getBrandName,
  renderVerificationEmailHtml,
} from './emails.templates';

type AuthSendVerificationEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'already_verified' | 'already_deleted';
  emailId?: string;
  tokenExpiresAt?: string;
}> &
  JsonObject;

type UsersSendAccountDeletionRequestedEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'not_scheduled' | 'already_deleted';
  emailId?: string;
  scheduledFor?: string;
}> &
  JsonObject;

type UsersSendAccountDeletionReminderEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'not_scheduled' | 'already_deleted' | 'too_late';
  emailId?: string;
  scheduledFor?: string;
}> &
  JsonObject;

type AuthSendPasswordResetEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'already_deleted';
  emailId?: string;
  tokenExpiresAt?: string;
  resetLink?: string;
}> &
  JsonObject;

type EmailsJobData =
  | AuthSendVerificationEmailJobData
  | AuthSendPasswordResetEmailJobData
  | UsersSendAccountDeletionRequestedEmailJobData
  | UsersSendAccountDeletionReminderEmailJobData;

type EmailsJobResult =
  | AuthSendVerificationEmailJobResult
  | AuthSendPasswordResetEmailJobResult
  | UsersSendAccountDeletionRequestedEmailJobResult
  | UsersSendAccountDeletionReminderEmailJobResult;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

@Injectable()
export class EmailsWorker implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly workers: QueueWorkerFactory,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailsWorker.name);
  }

  async onModuleInit(): Promise<void> {
    // Keep the worker process runnable in dev/test without Redis/DB/email unless configured.
    if (!this.workers.isEnabled() || !this.prisma.isEnabled() || !this.email.isEnabled()) return;

    this.workers.createWorker<EmailsJobData, EmailsJobResult>(
      EMAIL_QUEUE,
      async (job) => this.process(job),
      { concurrency: 5 },
    );
  }

  private async process(job: Job<EmailsJobData, EmailsJobResult>): Promise<EmailsJobResult> {
    if (job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB) {
      return await this.processVerificationEmail(job.data.userId);
    }

    if (job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB) {
      return await this.processPasswordResetEmail(job.data.userId);
    }

    if (job.name === USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB) {
      return await this.processAccountDeletionRequestedEmail(job.data.userId);
    }

    if (job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB) {
      return await this.processAccountDeletionReminderEmail(job.data.userId);
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
      select: { id: true, email: true, emailVerifiedAt: true, status: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Verification email job skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    if (user.status === 'DELETED') {
      this.logger.warn({ userId: user.id }, 'Verification email job skipped: user deleted');
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
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

    const publicAppUrl = asNonEmptyString(this.config.get<string>('PUBLIC_APP_URL'));
    const verifyUrl = publicAppUrl ? buildVerifyEmailUrl(publicAppUrl, token) : undefined;

    const text = [
      'Use this token to verify your email:',
      '',
      token,
      '',
      ...(verifyUrl ? ['Or open this link:', verifyUrl, ''] : []),
      `This token expires at ${expiresAt.toISOString()}.`,
    ].join('\n');

    const html = renderVerificationEmailHtml({
      brand: getBrandName(publicAppUrl),
      token,
      verifyUrl,
      expiresAtIso: expiresAt.toISOString(),
    });

    const sent = await this.email.send({
      to: user.email,
      subject: 'Verify your email',
      text,
      html,
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
      select: { id: true, email: true, status: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Password reset email job skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    if (user.status === 'DELETED') {
      this.logger.warn({ userId: user.id }, 'Password reset email job skipped: user deleted');
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
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

  private async processAccountDeletionRequestedEmail(
    userId: string,
  ): Promise<UsersSendAccountDeletionRequestedEmailJobResult> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, deletionScheduledFor: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Account deletion requested email skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    if (user.status === 'DELETED') {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
    }

    if (!user.deletionScheduledFor) {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'not_scheduled' };
    }

    const scheduledFor = user.deletionScheduledFor.toISOString();

    const publicAppUrl = asNonEmptyString(this.config.get<string>('PUBLIC_APP_URL'));
    const link = publicAppUrl ? new URL('/', publicAppUrl).toString() : undefined;

    const text = [
      'Account deletion requested',
      '',
      `Your account is scheduled to be deleted on ${scheduledFor}.`,
      'You can cancel before that time from within the app.',
      '',
      'If you did not request this, cancel the deletion request immediately and contact support.',
      ...(link ? ['', `Open the app: ${link}`] : []),
    ].join('\n');

    const sent = await this.email.send({
      to: user.email,
      subject: 'Account deletion requested',
      text,
    });

    this.logger.info(
      { userId: user.id, emailId: sent.id },
      'Sent account deletion requested email',
    );

    return {
      ok: true,
      userId: user.id,
      outcome: 'sent',
      emailId: sent.id,
      scheduledFor,
    };
  }

  private async processAccountDeletionReminderEmail(
    userId: string,
  ): Promise<UsersSendAccountDeletionReminderEmailJobResult> {
    const now = new Date();
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, deletionScheduledFor: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'Account deletion reminder email skipped: user not found');
      return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
    }

    if (user.status === 'DELETED') {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
    }

    if (!user.deletionScheduledFor) {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'not_scheduled' };
    }

    if (user.deletionScheduledFor.getTime() <= now.getTime()) {
      return { ok: true, userId: user.id, outcome: 'skipped', reason: 'too_late' };
    }

    const scheduledFor = user.deletionScheduledFor.toISOString();

    const publicAppUrl = asNonEmptyString(this.config.get<string>('PUBLIC_APP_URL'));
    const link = publicAppUrl ? new URL('/', publicAppUrl).toString() : undefined;

    const text = [
      'Account deletion reminder',
      '',
      `Your account is scheduled to be deleted on ${scheduledFor}.`,
      'If you want to keep your account, cancel the deletion request before that time.',
      ...(link ? ['', `Open the app: ${link}`] : []),
    ].join('\n');

    const sent = await this.email.send({
      to: user.email,
      subject: 'Account deletion reminder',
      text,
    });

    this.logger.info({ userId: user.id, emailId: sent.id }, 'Sent account deletion reminder email');

    return {
      ok: true,
      userId: user.id,
      outcome: 'sent',
      emailId: sent.id,
      scheduledFor,
    };
  }
}
