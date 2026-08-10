export type SignAccessTokenInput = Readonly<{
  userId: string;
  sessionId: string;
  emailVerified: boolean;
  roles: ReadonlyArray<string>;
  ttlSeconds: number;
}>;

export interface AccessTokenIssuer {
  signAccessToken(input: SignAccessTokenInput): Promise<string>;
  getPublicJwks(): Promise<unknown>;
}

export type LoginRateLimitContext = Readonly<{
  email: string;
  ip?: string;
}>;

export interface LoginRateLimiter {
  assertAllowed(ctx: LoginRateLimitContext): Promise<void>;
  recordFailure(ctx: LoginRateLimitContext): Promise<void>;
  recordSuccess(ctx: LoginRateLimitContext): Promise<void>;
}

export type OidcProvider = 'GOOGLE';

export type VerifiedOidcIdentity = Readonly<{
  provider: OidcProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  givenName?: string;
  familyName?: string;
}>;

export type VerifyOidcIdTokenResult =
  | Readonly<{ kind: 'not_configured' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'verified'; identity: VerifiedOidcIdentity }>;

export interface OidcIdTokenVerifier {
  verifyIdToken(input: {
    provider: OidcProvider;
    idToken: string;
  }): Promise<VerifyOidcIdTokenResult>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
