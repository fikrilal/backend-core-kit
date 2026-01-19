import { Inject, Injectable } from '@nestjs/common';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import type { Clock } from '../../app/time';
import type { AccountDeletionScheduler } from '../../app/ports/account-deletion.scheduler';
import {
  finalizeAccountDeletionJobId,
  USERS_FINALIZE_ACCOUNT_DELETION_JOB,
  USERS_QUEUE,
  type UsersFinalizeAccountDeletionJobData,
} from './user-account-deletion.job';
import { USERS_CLOCK } from '../users.tokens';

@Injectable()
export class UserAccountDeletionJobs implements AccountDeletionScheduler {
  constructor(
    private readonly queue: QueueProducer,
    @Inject(USERS_CLOCK) private readonly clock: Clock,
  ) {}

  async scheduleFinalize(userId: string, scheduledFor: Date): Promise<void> {
    const now = this.clock.now();
    const delayMs = Math.max(0, scheduledFor.getTime() - now.getTime());
    const jobId = finalizeAccountDeletionJobId(userId);

    // Ensure the jobId can be reused across request/cancel cycles.
    if (this.queue.isEnabled()) {
      await this.queue.removeJob(USERS_QUEUE, jobId);
    }

    const data: UsersFinalizeAccountDeletionJobData = {
      userId,
      scheduledFor: scheduledFor.toISOString(),
      enqueuedAt: now.toISOString(),
    };

    await this.queue.enqueue(USERS_QUEUE, USERS_FINALIZE_ACCOUNT_DELETION_JOB, data, {
      jobId,
      delay: delayMs,
    });
  }

  async cancelFinalize(userId: string): Promise<void> {
    const jobId = finalizeAccountDeletionJobId(userId);
    if (!this.queue.isEnabled()) return;
    await this.queue.removeJob(USERS_QUEUE, jobId);
  }
}
