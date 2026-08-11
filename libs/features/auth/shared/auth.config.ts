export type AuthConfig = Readonly<{
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  passwordMinLength: number;
}>;
