import { Inject, Injectable } from '@nestjs/common';
import { EmailService } from '../../../../platform/email/email.service';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import type { Clock } from '../../app/time';
import {
  accountDeletionReminderEmailJobId,
  accountDeletionRequestedEmailJobId,
  EMAIL_QUEUE,
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
  type UsersSendAccountDeletionReminderEmailJobData,
  type UsersSendAccountDeletionRequestedEmailJobData,
} from './user-account-deletion-email.job';
import { USERS_CLOCK } from '../users.tokens';

const ACCOUNT_DELETION_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UserAccountDeletionEmailJobs {
  constructor(
    private readonly queue: QueueProducer,
    private readonly email: EmailService,
    @Inject(USERS_CLOCK) private readonly clock: Clock,
  ) {}

  isEnabled(): boolean {
    return this.queue.isEnabled() && this.email.isEnabled();
  }

  async enqueueDeletionRequestedEmail(userId: string, scheduledFor: Date): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;
    if (!this.email.isEnabled()) return false;

    const jobId = accountDeletionRequestedEmailJobId(userId);
    await this.queue.removeJob(EMAIL_QUEUE, jobId);

    const now = this.clock.now();
    const data: UsersSendAccountDeletionRequestedEmailJobData = {
      userId,
      requestedAt: now.toISOString(),
      scheduledFor: scheduledFor.toISOString(),
    };

    await this.queue.enqueue(EMAIL_QUEUE, USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB, data, {
      jobId,
    });

    return true;
  }

  async scheduleDeletionReminderEmail(userId: string, scheduledFor: Date): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;
    if (!this.email.isEnabled()) return false;

    const jobId = accountDeletionReminderEmailJobId(userId);
    await this.queue.removeJob(EMAIL_QUEUE, jobId);

    const now = this.clock.now();
    const reminderAt = new Date(scheduledFor.getTime() - ACCOUNT_DELETION_REMINDER_BEFORE_MS);
    const delayMs = Math.max(0, reminderAt.getTime() - now.getTime());

    const data: UsersSendAccountDeletionReminderEmailJobData = {
      userId,
      enqueuedAt: now.toISOString(),
      reminderAt: reminderAt.toISOString(),
      scheduledFor: scheduledFor.toISOString(),
    };

    await this.queue.enqueue(EMAIL_QUEUE, USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB, data, {
      jobId,
      delay: delayMs,
    });

    return true;
  }

  async cancelDeletionReminderEmail(userId: string): Promise<void> {
    if (!this.queue.isEnabled()) return;
    const jobId = accountDeletionReminderEmailJobId(userId);
    await this.queue.removeJob(EMAIL_QUEUE, jobId);
  }
}
