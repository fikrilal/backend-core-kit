import type { Email } from '../../domain/email';
import type { AuthUserRecord } from '../auth.types';

export type CreateSessionInput = Readonly<{
  userId: string;
  deviceId?: string;
  deviceName?: string;
  sessionExpiresAt: Date;
  activeKey?: string;
}>;

export type SessionRecord = Readonly<{
  id: string;
  expiresAt: Date;
}>;

export type RefreshTokenRecord = Readonly<{
  id: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  sessionId: string;
  replacedById: string | null;
}>;

export type RefreshTokenWithSession = Readonly<{
  token: RefreshTokenRecord;
  session: Readonly<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  user: AuthUserRecord;
}>;

export type RefreshRotationResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'revoked_or_reused'; sessionId: string; userId: string }>
  | Readonly<{ kind: 'expired'; sessionId: string; userId: string }>
  | Readonly<{ kind: 'session_revoked'; sessionId: string; userId: string }>
  | Readonly<{
      kind: 'ok';
      sessionId: string;
      user: AuthUserRecord;
      sessionExpiresAt: Date;
    }>;

export interface AuthRepository {
  createUserWithPassword(email: Email, passwordHash: string): Promise<AuthUserRecord>;
  findUserForLogin(email: Email): Promise<{ user: AuthUserRecord; passwordHash: string } | null>;

  revokeActiveSessionForDevice(userId: string, activeKey: string, now: Date): Promise<void>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;

  createRefreshToken(
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshTokenRecord>;

  rotateRefreshToken(
    tokenHash: string,
    newTokenHash: string,
    now: Date,
  ): Promise<RefreshRotationResult>;

  revokeSessionByRefreshTokenHash(tokenHash: string, now: Date): Promise<boolean>;
}
