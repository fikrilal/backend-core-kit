import { AuthError } from './auth.errors';
import type { AuthRepository, SessionPushPlatform } from './ports/auth.repository';
import type { Clock } from './time';

export class AuthPushTokensService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly clock: Clock,
  ) {}

  private async assertUserIsNotDeleted(userId: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status === 'DELETED') {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
  }

  async upsertMyPushToken(input: {
    userId: string;
    sessionId: string;
    platform: SessionPushPlatform;
    token: string;
  }): Promise<void> {
    await this.assertUserIsNotDeleted(input.userId);

    const now = this.clock.now();
    const res = await this.repo.upsertSessionPushToken({ ...input, now });
    if (res.kind === 'session_not_found') {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
  }

  async revokeMyPushToken(input: { userId: string; sessionId: string }): Promise<void> {
    await this.assertUserIsNotDeleted(input.userId);

    const now = this.clock.now();
    await this.repo.revokeSessionPushToken({ ...input, now });
  }
}
