export type SignAccessTokenInput = Readonly<{
  userId: string;
  sessionId: string;
  emailVerified: boolean;
  ttlSeconds: number;
}>;

export interface AccessTokenIssuer {
  signAccessToken(input: SignAccessTokenInput): Promise<string>;
  getPublicJwks(): Promise<unknown>;
}
