export type LoginRateLimitContext = Readonly<{
  email: string;
  ip?: string;
}>;

export interface LoginRateLimiter {
  assertAllowed(ctx: LoginRateLimitContext): Promise<void>;
  recordFailure(ctx: LoginRateLimitContext): Promise<void>;
  recordSuccess(ctx: LoginRateLimitContext): Promise<void>;
}
