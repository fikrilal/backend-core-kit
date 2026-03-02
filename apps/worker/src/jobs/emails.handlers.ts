import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import {
  hashEmailVerificationToken,
  generateEmailVerificationToken,
} from '../../../../libs/features/auth/app/email-verification-token';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../../../../libs/features/auth/app/password-reset-token';
import { asNonEmptyString } from '../../../../libs/platform/auth/auth.utils';
import type { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { EmailService } from '../../../../libs/platform/email/email.service';
import { buildVerifyEmailUrl, getBrandName, renderVerificationEmailHtml } from './emails.templates';
import type {
  AuthSendPasswordResetEmailJobResult,
  AuthSendVerificationEmailJobResult,
  UsersSendAccountDeletionReminderEmailJobResult,
  UsersSendAccountDeletionRequestedEmailJobResult,
} from './emails.contracts';

type EmailsHandlersDeps = Readonly<{
  config: Pick<ConfigService, 'get'>;
  prisma: PrismaService;
  email: EmailService;
  logger: Pick<PinoLogger, 'info' | 'warn'>;
}>;

export async function runVerificationEmailJob(
  deps: EmailsHandlersDeps,
  userId: string,
): Promise<AuthSendVerificationEmailJobResult> {
  const now = new Date();
  const ttlSeconds = deps.config.get<number>('AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS') ?? 86400;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const client = deps.prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerifiedAt: true, status: true },
  });

  if (!user) {
    deps.logger.warn({ userId }, 'Verification email job skipped: user not found');
    return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
  }

  if (user.status === 'DELETED') {
    deps.logger.warn({ userId: user.id }, 'Verification email job skipped: user deleted');
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

  const publicAppUrl = asNonEmptyString(deps.config.get<string>('PUBLIC_APP_URL'));
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

  const sent = await deps.email.send({
    to: user.email,
    subject: 'Verify your email',
    text,
    html,
  });

  deps.logger.info({ userId: user.id, emailId: sent.id }, 'Sent verification email');

  return {
    ok: true,
    userId: user.id,
    outcome: 'sent',
    emailId: sent.id,
    tokenExpiresAt: expiresAt.toISOString(),
  };
}

export async function runPasswordResetEmailJob(
  deps: EmailsHandlersDeps,
  userId: string,
): Promise<AuthSendPasswordResetEmailJobResult> {
  const now = new Date();
  const ttlSeconds = deps.config.get<number>('AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS') ?? 1800;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const client = deps.prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  });

  if (!user) {
    deps.logger.warn({ userId }, 'Password reset email job skipped: user not found');
    return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
  }

  if (user.status === 'DELETED') {
    deps.logger.warn({ userId: user.id }, 'Password reset email job skipped: user deleted');
    return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
  }

  const publicAppUrl = asNonEmptyString(deps.config.get<string>('PUBLIC_APP_URL'));
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

  const sent = await deps.email.send({
    to: user.email,
    subject: 'Reset your password',
    text,
  });

  deps.logger.info({ userId: user.id, emailId: sent.id }, 'Sent password reset email');

  return {
    ok: true,
    userId: user.id,
    outcome: 'sent',
    emailId: sent.id,
    tokenExpiresAt: expiresAt.toISOString(),
    resetLink: resetUrl.toString(),
  };
}

export async function runAccountDeletionRequestedEmailJob(
  deps: EmailsHandlersDeps,
  userId: string,
): Promise<UsersSendAccountDeletionRequestedEmailJobResult> {
  const client = deps.prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true, deletionScheduledFor: true },
  });

  if (!user) {
    deps.logger.warn({ userId }, 'Account deletion requested email skipped: user not found');
    return { ok: true, userId, outcome: 'skipped', reason: 'user_not_found' };
  }

  if (user.status === 'DELETED') {
    return { ok: true, userId: user.id, outcome: 'skipped', reason: 'already_deleted' };
  }

  if (!user.deletionScheduledFor) {
    return { ok: true, userId: user.id, outcome: 'skipped', reason: 'not_scheduled' };
  }

  const scheduledFor = user.deletionScheduledFor.toISOString();

  const publicAppUrl = asNonEmptyString(deps.config.get<string>('PUBLIC_APP_URL'));
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

  const sent = await deps.email.send({
    to: user.email,
    subject: 'Account deletion requested',
    text,
  });

  deps.logger.info({ userId: user.id, emailId: sent.id }, 'Sent account deletion requested email');

  return {
    ok: true,
    userId: user.id,
    outcome: 'sent',
    emailId: sent.id,
    scheduledFor,
  };
}

export async function runAccountDeletionReminderEmailJob(
  deps: EmailsHandlersDeps,
  userId: string,
): Promise<UsersSendAccountDeletionReminderEmailJobResult> {
  const now = new Date();
  const client = deps.prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true, deletionScheduledFor: true },
  });

  if (!user) {
    deps.logger.warn({ userId }, 'Account deletion reminder email skipped: user not found');
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

  const publicAppUrl = asNonEmptyString(deps.config.get<string>('PUBLIC_APP_URL'));
  const link = publicAppUrl ? new URL('/', publicAppUrl).toString() : undefined;

  const text = [
    'Account deletion reminder',
    '',
    `Your account is scheduled to be deleted on ${scheduledFor}.`,
    'If you want to keep your account, cancel the deletion request before that time.',
    ...(link ? ['', `Open the app: ${link}`] : []),
  ].join('\n');

  const sent = await deps.email.send({
    to: user.email,
    subject: 'Account deletion reminder',
    text,
  });

  deps.logger.info({ userId: user.id, emailId: sent.id }, 'Sent account deletion reminder email');

  return {
    ok: true,
    userId: user.id,
    outcome: 'sent',
    emailId: sent.id,
    scheduledFor,
  };
}
