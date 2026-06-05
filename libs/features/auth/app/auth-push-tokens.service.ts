import { AuthError } from './auth.errors';
import type { AuthRepository, SessionPushPlatform } from './ports/auth.repository';
import type { Clock } from './time';
import { ErrorCode } from '../../../shared/error-codes';
import { assertAuthUserIsActive } from './auth-user-state';

export class AuthPushTokensService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async upsertMyPushToken(input: {
    userId: string;
    sessionId: string;
    platform: SessionPushPlatform;
    token: string;
  }): Promise<void> {
    await assertAuthUserIsActive(this.repo, input.userId);

    const now = this.clock.now();
    const res = await this.repo.upsertSessionPushToken({ ...input, now });
    if (res.kind === 'session_not_found') {
      throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    }
  }

  async revokeMyPushToken(input: { userId: string; sessionId: string }): Promise<void> {
    await assertAuthUserIsActive(this.repo, input.userId);

    const now = this.clock.now();
    await this.repo.revokeSessionPushToken({ ...input, now });
  }
}
