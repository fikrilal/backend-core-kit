export type JwtAlg = 'EdDSA' | 'RS256';

export type AuthPrincipal = Readonly<{
  userId: string;
  sessionId: string;
  emailVerified: boolean;
}>;
