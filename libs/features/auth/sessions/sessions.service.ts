import type { ListQuery } from '../../../shared/list-query';
import type {
  AuthRepository,
  UserSessionsSortField,
  UserSessionListItem,
} from '../shared/ports/auth.repository';
import type { Clock } from '../../../shared/time';
import { requireExistingNonDeletedUser } from '../shared/auth.service.helpers';

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

  async listMySessions(
    userId: string,
    currentSessionId: string,
    query: ListQuery<UserSessionsSortField, never>,
  ): Promise<ListMySessionsResult> {
    await requireExistingNonDeletedUser(this.repo, userId);

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
    await requireExistingNonDeletedUser(this.repo, userId);

    const ok = await this.repo.revokeSessionById(userId, sessionId, this.clock.now());
    return ok ? { kind: 'ok' } : { kind: 'not_found' };
  }
}
