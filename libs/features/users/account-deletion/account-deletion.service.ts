import type { UsersRepository } from '../shared/ports/users.repository';
import type { AccountDeletionScheduler } from '../shared/ports/account-deletion.scheduler';
import { UserNotFoundError, UsersError } from '../shared/users.errors';
import { UsersErrorCode } from '../shared/users.errors';
import type { UserRecord } from '../shared/users.model';
import { addDays, type Clock } from '../../../shared/time';

const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;

export class AccountDeletionService {
  constructor(
    private readonly users: UsersRepository,
    private readonly accountDeletion: AccountDeletionScheduler,
    private readonly clock: Clock,
  ) {}

  async requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<Readonly<{ scheduledFor: Date; newlyRequested: boolean }>> {
    const now = this.clock.now();
    const scheduledFor = addDays(now, ACCOUNT_DELETION_GRACE_PERIOD_DAYS);

    const res = await this.users.requestAccountDeletion({
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      now,
      scheduledFor,
    });

    if (res.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    if (res.kind === 'last_admin') {
      throw new UsersError({
        status: 409,
        code: UsersErrorCode.USERS_CANNOT_DELETE_LAST_ADMIN,
        message: 'Cannot delete the last admin',
      });
    }

    this.assertUserNotDeleted(res.user);

    const due = res.user.deletionScheduledFor ?? scheduledFor;
    await this.accountDeletion.scheduleFinalize(input.userId, due);

    return { scheduledFor: due, newlyRequested: res.kind === 'ok' };
  }

  async cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<void> {
    const now = this.clock.now();
    const res = await this.users.cancelAccountDeletion({
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      now,
    });

    if (res.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    this.assertUserNotDeleted(res.user);

    await this.accountDeletion.cancelFinalize(input.userId);
  }

  private assertUserNotDeleted(user: UserRecord): void {
    if (user.status === 'DELETED') {
      throw new UserNotFoundError();
    }
  }
}
