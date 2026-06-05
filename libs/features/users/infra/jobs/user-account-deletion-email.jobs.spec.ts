import { EmailService } from '../../../../platform/email/email.service';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import { UserAccountDeletionEmailJobs } from './user-account-deletion-email.jobs';
import {
  accountDeletionReminderEmailJobId,
  EMAIL_QUEUE,
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
} from './user-account-deletion-email.job';
import { createPrototypeStub } from '../../../../../test/support/stubs';

type Clock = Readonly<{ now(): Date }>;

describe('UserAccountDeletionEmailJobs', () => {
  function createHarness(params?: { now?: Date; queueEnabled?: boolean; emailEnabled?: boolean }): {
    jobs: UserAccountDeletionEmailJobs;
    removeJob: jest.Mock;
    enqueue: jest.Mock;
  } {
    const now = params?.now ?? new Date('2026-01-01T00:00:00.000Z');
    const queueEnabled = params?.queueEnabled ?? true;
    const emailEnabled = params?.emailEnabled ?? true;

    const removeJob = jest.fn(async () => true);
    const enqueue = jest.fn(async () => ({ id: 'job-1' }));

    const queue = createPrototypeStub(QueueProducer, {
      isEnabled: () => queueEnabled,
      removeJob,
      enqueue,
    });

    const email = createPrototypeStub(EmailService, {
      isEnabled: () => emailEnabled,
      send: jest.fn(),
    });

    const clock: Clock = {
      now: () => new Date(now.getTime()),
    };

    return {
      jobs: new UserAccountDeletionEmailJobs(queue, email, clock),
      removeJob,
      enqueue,
    };
  }

  it('schedules a delayed reminder when outside the near-due window', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const scheduledFor = new Date('2026-01-31T00:00:00.000Z');
    const reminderAt = new Date('2026-01-30T00:00:00.000Z');

    const { jobs, removeJob, enqueue } = createHarness({ now });

    const scheduled = await jobs.scheduleDeletionReminderEmail('user-1', scheduledFor);

    expect(scheduled).toBe(true);
    expect(removeJob).toHaveBeenCalledTimes(1);
    expect(removeJob).toHaveBeenCalledWith(
      EMAIL_QUEUE,
      accountDeletionReminderEmailJobId('user-1'),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      EMAIL_QUEUE,
      USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
      {
        userId: 'user-1',
        enqueuedAt: now.toISOString(),
        reminderAt: reminderAt.toISOString(),
        scheduledFor: scheduledFor.toISOString(),
      },
      {
        jobId: accountDeletionReminderEmailJobId('user-1'),
        delay: reminderAt.getTime() - now.getTime(),
      },
    );
  });

  it('does not enqueue reminders when already in the near-due window', async () => {
    const now = new Date('2026-01-30T01:00:00.000Z');
    const scheduledFor = new Date('2026-01-31T00:00:00.000Z');

    const { jobs, removeJob, enqueue } = createHarness({ now });

    const scheduled = await jobs.scheduleDeletionReminderEmail('user-2', scheduledFor);

    expect(scheduled).toBe(false);
    expect(removeJob).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps repeated near-due calls as no-op (no duplicate immediate reminders)', async () => {
    const now = new Date('2026-01-30T12:00:00.000Z');
    const scheduledFor = new Date('2026-01-31T00:00:00.000Z');

    const { jobs, removeJob, enqueue } = createHarness({ now });

    const first = await jobs.scheduleDeletionReminderEmail('user-3', scheduledFor);
    const second = await jobs.scheduleDeletionReminderEmail('user-3', scheduledFor);

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(removeJob).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
