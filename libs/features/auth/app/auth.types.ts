import type { Email } from '../domain/email';
import type { AuthMethod } from '../../../shared/auth/auth-method';

export type AuthRole = 'USER' | 'ADMIN';

export type AuthUserStatus = 'ACTIVE' | 'SUSPENDED';

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
