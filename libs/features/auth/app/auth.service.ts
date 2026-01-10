import { normalizeEmail } from '../domain/email';
import { AuthErrorCode } from './auth.error-codes';
import { AuthError, EmailAlreadyExistsError } from './auth.errors';
import type { AuthRepository } from './ports/auth.repository';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { PasswordHasher } from './ports/password-hasher';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import type { Clock } from './time';
import type { AuthResult, AuthUserRecord, AuthUserView } from './auth.types';

export type AuthConfig = Readonly<{
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  passwordMinLength: number;
}>;

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly loginRateLimiter: LoginRateLimiter,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
  ) {}

  async registerWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
  }): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    this.assertPasswordPolicy(input.password);

    const passwordHash = await this.passwordHasher.hash(input.password);

    let user: AuthUserRecord;
    try {
      user = await this.repo.createUserWithPassword(email, passwordHash);
    } catch (err: unknown) {
      // Email uniqueness is enforced at the DB layer; translate to a stable conflict error.
      if (err instanceof EmailAlreadyExistsError) {
        throw new AuthError({
          status: 409,
          code: AuthErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
          message: 'Email already exists',
        });
      }
      throw err;
    }

    const now = this.clock.now();
    const sessionExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000);
    const { sessionId, refreshToken } = await this.createSessionAndTokens(user.id, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      sessionExpiresAt,
      now,
    });

    const accessToken = await this.accessTokens.signAccessToken({
      userId: user.id,
      sessionId,
      emailVerified: user.emailVerifiedAt !== null,
      roles: [user.role],
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });

    return { user: this.toUserView(user), accessToken, refreshToken };
  }

  async loginWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
  }): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const now = this.clock.now();

    await this.loginRateLimiter.assertAllowed({ email, ip: input.ip });

    const found = await this.repo.findUserForLogin(email);
    const ok =
      found !== null ? await this.passwordHasher.verify(found.passwordHash, input.password) : false;

    if (!ok || !found) {
      await this.loginRateLimiter.recordFailure({ email, ip: input.ip });
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    await this.loginRateLimiter.recordSuccess({ email, ip: input.ip });

    const sessionExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000);
    const { sessionId, refreshToken } = await this.createSessionAndTokens(found.user.id, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      sessionExpiresAt,
      now,
    });

    const accessToken = await this.accessTokens.signAccessToken({
      userId: found.user.id,
      sessionId,
      emailVerified: found.user.emailVerifiedAt !== null,
      roles: [found.user.role],
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });

    return { user: this.toUserView(found.user), accessToken, refreshToken };
  }

  async refresh(input: { refreshToken: string }): Promise<AuthResult> {
    const now = this.clock.now();
    const currentHash = hashRefreshToken(input.refreshToken);
    const nextRefreshToken = generateRefreshToken();
    const nextHash = hashRefreshToken(nextRefreshToken);

    const result = await this.repo.rotateRefreshToken(currentHash, nextHash, now);
    if (result.kind === 'not_found') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    if (result.kind === 'expired') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
        message: 'Refresh token expired',
      });
    }

    if (result.kind === 'session_revoked') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_SESSION_REVOKED,
        message: 'Session revoked',
      });
    }

    if (result.kind === 'revoked_or_reused') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
        message: 'Refresh token reuse detected',
      });
    }

    const accessToken = await this.accessTokens.signAccessToken({
      userId: result.user.id,
      sessionId: result.sessionId,
      emailVerified: result.user.emailVerifiedAt !== null,
      roles: [result.user.role],
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });

    return { user: this.toUserView(result.user), accessToken, refreshToken: nextRefreshToken };
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    const now = this.clock.now();
    const hash = hashRefreshToken(input.refreshToken);
    const ok = await this.repo.revokeSessionByRefreshTokenHash(hash, now);
    if (!ok) {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }
  }

  async getPublicJwks(): Promise<unknown> {
    return this.accessTokens.getPublicJwks();
  }

  private toUserView(user: AuthUserRecord): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  private assertPasswordPolicy(password: string): void {
    const min = this.config.passwordMinLength;
    if (typeof password !== 'string' || password.length < min) {
      throw new AuthError({
        status: 400,
        code: 'VALIDATION_FAILED',
        issues: [{ field: 'password', message: `Password must be at least ${min} characters` }],
      });
    }
  }

  private activeKeyFor(userId: string, deviceId?: string): string | undefined {
    if (!deviceId) return undefined;
    return `${userId}:${deviceId}`;
  }

  private async createSessionAndTokens(
    userId: string,
    input: {
      deviceId?: string;
      deviceName?: string;
      sessionExpiresAt: Date;
      now: Date;
    },
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const activeKey = this.activeKeyFor(userId, input.deviceId);
    if (activeKey) {
      await this.repo.revokeActiveSessionForDevice(userId, activeKey, input.now);
    }

    const session = await this.repo.createSession({
      userId,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      sessionExpiresAt: input.sessionExpiresAt,
      activeKey,
    });

    await this.repo.createRefreshToken(session.id, refreshTokenHash, session.expiresAt);

    return { sessionId: session.id, refreshToken };
  }
}
