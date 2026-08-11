import { createHash, randomBytes } from 'crypto';
import type { AuthMethod } from '../../../shared/auth/auth-method';

export type AuthConfig = Readonly<{
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  passwordMinLength: number;
}>;

export type Email = string;

export function normalizeEmail(raw: string): Email {
  return raw.trim().toLowerCase();
}

export type AuthRole = 'USER' | 'ADMIN';

export type AuthUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type AuthUserRecord = Readonly<{
  id: string;
  email: Email;
  emailVerifiedAt: Date | null;
  role: AuthRole;
  status: AuthUserStatus;
}>;

export type AuthUserView = Readonly<{
  id: string;
  email: Email;
  emailVerified: boolean;
  authMethods?: ReadonlyArray<AuthMethod>;
}>;

export type AuthTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
}>;

export type AuthResult = Readonly<
  {
    user: AuthUserView;
  } & AuthTokens
>;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('base64url');
}
