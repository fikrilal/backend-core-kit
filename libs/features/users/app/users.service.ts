import type { UsersRepository } from './ports/users.repository';
import { UserNotFoundError } from './users.errors';
import type { MeView } from './users.types';
import type { UserProfileRecord } from './users.types';

export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const profile: UserProfileRecord = user.profile ?? {
      displayName: null,
      givenName: null,
      familyName: null,
    };

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      roles: [user.role],
      profile,
    };
  }
}
