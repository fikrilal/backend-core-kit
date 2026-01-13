import type { UsersRepository } from './ports/users.repository';
import type { AccountDeletionScheduler } from './ports/account-deletion.scheduler';
import { UserNotFoundError, UsersError } from './users.errors';
import { UsersErrorCode } from './users.error-codes';
import type { MeView } from './users.types';
import type { UpdateMeProfilePatch, UserProfileRecord, UserRecord } from './users.types';

const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;

export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly accountDeletion: AccountDeletionScheduler,
  ) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    return this.toMeView(user);
  }

  async updateMeProfile(userId: string, patch: UpdateMeProfilePatch): Promise<MeView> {
    const user = await this.users.updateProfile(userId, patch);
    if (!user) {
      throw new UserNotFoundError();
    }

    return this.toMeView(user);
  }

  async requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<Readonly<{ scheduledFor: Date; newlyRequested: boolean }>> {
    const now = new Date();
    const scheduledFor = new Date(
      now.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

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

    const due = res.user.deletionScheduledFor ?? scheduledFor;
    await this.accountDeletion.scheduleFinalize(input.userId, due);

    return { scheduledFor: due, newlyRequested: res.kind === 'ok' };
  }

  async cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<void> {
    const now = new Date();
    const res = await this.users.cancelAccountDeletion({
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      now,
    });

    if (res.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    await this.accountDeletion.cancelFinalize(input.userId);
  }

  private toMeView(user: UserRecord): MeView {
    const profile: UserProfileRecord = user.profile ?? {
      profileImageFileId: null,
      displayName: null,
      givenName: null,
      familyName: null,
    };

    const accountDeletion =
      user.deletionRequestedAt && user.deletionScheduledFor
        ? {
            requestedAt: user.deletionRequestedAt.toISOString(),
            scheduledFor: user.deletionScheduledFor.toISOString(),
          }
        : null;

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      roles: [user.role],
      authMethods: [...user.authMethods],
      profile,
      accountDeletion,
    };
  }
}
