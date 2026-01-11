import { normalizeEmail } from '../domain/email';
import { AuthErrorCode } from './auth.error-codes';
import { AuthError, EmailAlreadyExistsError } from './auth.errors';
import type { AuthRepository } from './ports/auth.repository';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { PasswordHasher } from './ports/password-hasher';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { hashEmailVerificationToken } from './email-verification-token';
import { hashPasswordResetToken } from './password-reset-token';
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

  async changePassword(input: {
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    this.assertPasswordPolicy(input.newPassword);

    if (input.currentPassword === input.newPassword) {
      throw new AuthError({
        status: 400,
        code: 'VALIDATION_FAILED',
        issues: [{ field: 'newPassword', message: 'New password must be different' }],
      });
    }

    const existing = await this.repo.findPasswordCredential(input.userId);
    if (!existing) {
      throw new AuthError({
        status: 409,
        code: AuthErrorCode.AUTH_PASSWORD_NOT_SET,
        message: 'Password is not set for this account',
      });
    }

    const ok = await this.passwordHasher.verify(existing.passwordHash, input.currentPassword);
    if (!ok) {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
        message: 'Current password is invalid',
      });
    }

    const now = this.clock.now();
    const newHash = await this.passwordHasher.hash(input.newPassword);

    const changed = await this.repo.changePasswordAndRevokeOtherSessions({
      userId: input.userId,
      sessionId: input.sessionId,
      expectedCurrentPasswordHash: existing.passwordHash,
      newPasswordHash: newHash,
      now,
    });

    if (changed.kind === 'ok') return;

    if (changed.kind === 'not_found') {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    if (changed.kind === 'password_not_set') {
      throw new AuthError({
        status: 409,
        code: AuthErrorCode.AUTH_PASSWORD_NOT_SET,
        message: 'Password is not set for this account',
      });
    }

    if (changed.kind === 'current_password_mismatch') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
        message: 'Current password is invalid',
      });
    }

    // Exhaustiveness guard.
    throw new Error('Unexpected changePassword result');
  }

  async refresh(input: { refreshToken: string }): Promise<AuthResult> {
    const now = this.clock.now();
    const currentHash = hashRefreshToken(input.refreshToken);

    const existing = await this.repo.findRefreshTokenWithSession(currentHash);
    if (!existing) {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    if (existing.session.revokedAt !== null) {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_SESSION_REVOKED,
        message: 'Session revoked',
      });
    }

    const expired =
      existing.token.expiresAt.getTime() <= now.getTime() ||
      existing.session.expiresAt.getTime() <= now.getTime();
    if (expired) {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
        message: 'Refresh token expired',
      });
    }

    const alreadyUsed = existing.token.revokedAt !== null || existing.token.replacedById !== null;
    if (alreadyUsed) {
      await this.repo.revokeSessionByRefreshTokenHash(currentHash, now);
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
        message: 'Refresh token reuse detected',
      });
    }

    // Mint the access token before rotating the refresh token so that non-2xx refresh responses
    // never consume the caller's refresh token.
    const accessToken = await this.accessTokens.signAccessToken({
      userId: existing.user.id,
      sessionId: existing.session.id,
      emailVerified: existing.user.emailVerifiedAt !== null,
      roles: [existing.user.role],
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });

    const nextRefreshToken = generateRefreshToken();
    const nextHash = hashRefreshToken(nextRefreshToken);

    const rotation = await this.repo.rotateRefreshToken(currentHash, nextHash, now);
    if (rotation.kind === 'not_found') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    if (rotation.kind === 'expired') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
        message: 'Refresh token expired',
      });
    }

    if (rotation.kind === 'session_revoked') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_SESSION_REVOKED,
        message: 'Session revoked',
      });
    }

    if (rotation.kind === 'revoked_or_reused') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
        message: 'Refresh token reuse detected',
      });
    }

    return { user: this.toUserView(existing.user), accessToken, refreshToken: nextRefreshToken };
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

  async verifyEmail(input: { token: string }): Promise<void> {
    const now = this.clock.now();
    const tokenHash = hashEmailVerificationToken(input.token);

    const result = await this.repo.verifyEmailByTokenHash(tokenHash, now);
    if (result.kind === 'ok' || result.kind === 'already_verified') return;

    if (result.kind === 'token_expired') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_EXPIRED,
        message: 'Email verification token expired',
      });
    }

    throw new AuthError({
      status: 400,
      code: AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_INVALID,
      message: 'Email verification token is invalid',
    });
  }

  async getEmailVerificationStatus(userId: string): Promise<'verified' | 'unverified'> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new AuthError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    return user.emailVerifiedAt !== null ? 'verified' : 'unverified';
  }

  async requestPasswordReset(input: {
    email: string;
  }): Promise<Readonly<{ userId: string }> | null> {
    const email = normalizeEmail(input.email);
    const userId = await this.repo.findUserIdByEmail(email);
    if (!userId) return null;
    return { userId };
  }

  async confirmPasswordReset(input: { token: string; newPassword: string }): Promise<void> {
    this.assertPasswordPolicy(input.newPassword);

    const now = this.clock.now();
    const tokenHash = hashPasswordResetToken(input.token);
    const newPasswordHash = await this.passwordHasher.hash(input.newPassword);

    const result = await this.repo.resetPasswordByTokenHash(tokenHash, newPasswordHash, now);
    if (result.kind === 'ok') return;

    if (result.kind === 'token_expired') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_PASSWORD_RESET_TOKEN_EXPIRED,
        message: 'Password reset token expired',
      });
    }

    throw new AuthError({
      status: 400,
      code: AuthErrorCode.AUTH_PASSWORD_RESET_TOKEN_INVALID,
      message: 'Password reset token is invalid',
    });
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
