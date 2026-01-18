import type { ListQuery } from '../../../shared/list-query';
import { AuthError } from './auth.errors';
import { ErrorCode } from '../../../shared/error-codes';
import type {
  AuthRepository,
  UserSessionsSortField,
  UserSessionListItem,
} from './ports/auth.repository';
import type { Clock } from './time';

export type SessionStatus = 'active' | 'revoked' | 'expired';

export type SessionView = Readonly<{
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  current: boolean;
  status: SessionStatus;
}>;

export type ListMySessionsResult = Readonly<{
  items: ReadonlyArray<SessionView>;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}>;

function statusFor(
  session: Pick<UserSessionListItem, 'expiresAt' | 'revokedAt'>,
  now: Date,
): SessionStatus {
  if (session.revokedAt !== null) return 'revoked';
  if (session.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export class AuthSessionsService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly clock: Clock,
  ) {}

  private async assertUserIsNotDeleted(userId: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status === 'DELETED') {
      throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    }
  }

  async listMySessions(
    userId: string,
    currentSessionId: string,
    query: ListQuery<UserSessionsSortField, never>,
  ): Promise<ListMySessionsResult> {
    await this.assertUserIsNotDeleted(userId);

    const now = this.clock.now();
    const res = await this.repo.listUserSessions(userId, query);

    const items: SessionView[] = res.items.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      ip: s.ip,
      userAgent: s.userAgent,
      lastSeenAt: s.lastSeenAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      current: s.id === currentSessionId,
      status: statusFor(s, now),
    }));

    return { ...res, items };
  }

  async revokeMySession(
    userId: string,
    sessionId: string,
  ): Promise<Readonly<{ kind: 'ok' } | { kind: 'not_found' }>> {
    await this.assertUserIsNotDeleted(userId);

    const ok = await this.repo.revokeSessionById(userId, sessionId, this.clock.now());
    return ok ? { kind: 'ok' } : { kind: 'not_found' };
  }
}
