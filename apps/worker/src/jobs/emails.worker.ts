import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from '../../../../libs/platform/email/email.service';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import {
  AUTH_SEND_VERIFICATION_EMAIL_JOB,
  EMAIL_QUEUE,
} from '../../../../libs/features/auth/infra/jobs/auth-email-verification.job';
import { AUTH_SEND_PASSWORD_RESET_EMAIL_JOB } from '../../../../libs/features/auth/infra/jobs/auth-password-reset.job';
import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
} from '../../../../libs/features/users/infra/jobs/user-account-deletion-email.job';
import type { EmailsJobData, EmailsJobResult } from './emails.contracts';
import {
  runAccountDeletionReminderEmailJob,
  runAccountDeletionRequestedEmailJob,
  runPasswordResetEmailJob,
  runVerificationEmailJob,
} from './emails.handlers';

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
    const deps = {
      config: this.config,
      prisma: this.prisma,
      email: this.email,
      logger: this.logger,
    };

    if (job.name === AUTH_SEND_VERIFICATION_EMAIL_JOB) {
      return await runVerificationEmailJob(deps, job.data.userId);
    }

    if (job.name === AUTH_SEND_PASSWORD_RESET_EMAIL_JOB) {
      return await runPasswordResetEmailJob(deps, job.data.userId);
    }

    if (job.name === USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB) {
      return await runAccountDeletionRequestedEmailJob(deps, job.data.userId);
    }

    if (job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB) {
      return await runAccountDeletionReminderEmailJob(deps, job.data.userId);
    }

    throw new Error(`Unknown job name "${job.name}" on queue "${EMAIL_QUEUE}"`);
  }
}
