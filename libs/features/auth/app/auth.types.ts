import type { Email } from '../domain/email';

export type AuthRole = 'USER' | 'ADMIN';

export type AuthUserRecord = Readonly<{
  id: string;
  email: Email;
  emailVerifiedAt: Date | null;
  role: AuthRole;
}>;

export type AuthUserView = Readonly<{
  id: string;
  email: Email;
  emailVerified: boolean;
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
