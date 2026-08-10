import type { UsersRepository } from '../shared/ports/users.repository';
import { UserNotFoundError } from '../shared/users.errors';
import type { MeView } from '../shared/users.model';
import type { UpdateMeProfilePatch, UserProfileRecord, UserRecord } from '../shared/users.model';

export class MeService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    this.assertUserNotDeleted(user);

    return this.toMeView(user);
  }

  async updateMeProfile(userId: string, patch: UpdateMeProfilePatch): Promise<MeView> {
    const user = await this.users.updateProfile(userId, patch);
    if (!user) {
      throw new UserNotFoundError();
    }
    this.assertUserNotDeleted(user);

    return this.toMeView(user);
  }

  private assertUserNotDeleted(user: UserRecord): void {
    if (user.status === 'DELETED') {
      throw new UserNotFoundError();
    }
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
