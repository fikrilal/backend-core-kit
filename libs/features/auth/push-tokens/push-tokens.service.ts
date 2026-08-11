import { AuthError } from '../shared/auth.errors';
import type { AuthRepository, SessionPushPlatform } from '../shared/ports/auth.repository';
import type { Clock } from '../../../shared/time';
import { ErrorCode } from '../../../shared/error-codes';
import { requireExistingNonDeletedUser } from '../shared/auth.service.helpers';

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
    await requireExistingNonDeletedUser(this.repo, input.userId);

    const now = this.clock.now();
    const res = await this.repo.upsertSessionPushToken({ ...input, now });
    if (res.kind === 'session_not_found') {
      throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    }
  }

  async revokeMyPushToken(input: { userId: string; sessionId: string }): Promise<void> {
    await requireExistingNonDeletedUser(this.repo, input.userId);

    const now = this.clock.now();
    await this.repo.revokeSessionPushToken({ ...input, now });
  }
}
