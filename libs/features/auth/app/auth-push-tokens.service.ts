import { AuthError } from './auth.errors';
import type { AuthRepository, SessionPushPlatform } from './ports/auth.repository';

export class AuthPushTokensService {
  constructor(private readonly repo: AuthRepository) {}

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
    now: Date;
  }): Promise<void> {
    await this.assertUserIsNotDeleted(input.userId);

    const res = await this.repo.upsertSessionPushToken(input);
    if (res.kind === 'session_not_found') {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
  }

  async revokeMyPushToken(input: { userId: string; sessionId: string; now: Date }): Promise<void> {
    await this.assertUserIsNotDeleted(input.userId);

    await this.repo.revokeSessionPushToken(input);
  }
}
