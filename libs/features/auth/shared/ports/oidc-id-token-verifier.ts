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
