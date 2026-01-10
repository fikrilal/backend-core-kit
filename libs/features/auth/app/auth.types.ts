import type { Email } from '../domain/email';

export type AuthUserRecord = Readonly<{
  id: string;
  email: Email;
  emailVerifiedAt: Date | null;
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
