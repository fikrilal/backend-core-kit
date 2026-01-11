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

export type ChangePasswordResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'password_not_set' }>
  | Readonly<{ kind: 'current_password_mismatch' }>;

export type VerifyEmailResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'already_verified' }>
  | Readonly<{ kind: 'token_invalid' }>
  | Readonly<{ kind: 'token_expired' }>;

export type ResetPasswordByTokenHashResult =
  | Readonly<{ kind: 'ok'; userId: string }>
  | Readonly<{ kind: 'token_invalid' }>
  | Readonly<{ kind: 'token_expired' }>;

export interface AuthRepository {
  createUserWithPassword(email: Email, passwordHash: string): Promise<AuthUserRecord>;
  findUserIdByEmail(email: Email): Promise<string | null>;
  findUserForLogin(email: Email): Promise<{ user: AuthUserRecord; passwordHash: string } | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;

  findPasswordCredential(userId: string): Promise<Readonly<{ passwordHash: string }> | null>;

  verifyEmailByTokenHash(tokenHash: string, now: Date): Promise<VerifyEmailResult>;

  resetPasswordByTokenHash(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<ResetPasswordByTokenHashResult>;

  changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    sessionId: string;
    expectedCurrentPasswordHash: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<ChangePasswordResult>;

  findRefreshTokenWithSession(tokenHash: string): Promise<RefreshTokenWithSession | null>;

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
