import { AuthError } from './auth.errors';
import type { AuthRepository, SessionPushPlatform } from './ports/auth.repository';

export class AuthPushTokensService {
  constructor(private readonly repo: AuthRepository) {}

  async upsertMyPushToken(input: {
    userId: string;
    sessionId: string;
    platform: SessionPushPlatform;
    token: string;
    now: Date;
  }): Promise<void> {
    const user = await this.repo.findUserById(input.userId);
    if (!user) {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    const res = await this.repo.upsertSessionPushToken(input);
    if (res.kind === 'session_not_found') {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
  }

  async revokeMyPushToken(input: { userId: string; sessionId: string; now: Date }): Promise<void> {
    const user = await this.repo.findUserById(input.userId);
    if (!user) {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    await this.repo.revokeSessionPushToken(input);
  }
}
