import { AuthErrorCode } from './auth.error-codes';
import { AuthError } from './auth.errors';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { AuthRepository } from './ports/auth.repository';
import type { AuthResult, AuthUserRecord } from './auth.types';
import type { Clock } from './time';
import type { AuthConfig } from './auth.config';
import type { AuthMethod } from '../../../shared/auth/auth-method';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import {
  assertUserIsNotSuspended,
  buildActiveSessionKey,
  createInvalidRefreshTokenError,
  sessionExpiresAtFrom,
  toAuthUserView,
} from './auth.service.helpers';

export class AuthSessionLifecycleService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
  ) {}

  async issueTokensForNewSession(
    user: AuthUserRecord,
    authMethods: ReadonlyArray<AuthMethod>,
    input: {
      deviceId?: string;
      deviceName?: string;
      ip?: string;
      userAgent?: string;
      now: Date;
    },
  ): Promise<AuthResult> {
    const { sessionId, refreshToken } = await this.createSessionAndTokens(user.id, input);
    const accessToken = await this.signAccessTokenForUser(user, sessionId);
    return { user: toAuthUserView(user, authMethods), accessToken, refreshToken };
  }

  async refresh(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    const now = this.clock.now();
    const currentHash = hashRefreshToken(input.refreshToken);

    const existing = await this.repo.findRefreshTokenWithSession(currentHash);
    if (!existing) {
      throw createInvalidRefreshTokenError();
    }

    if (existing.user.status === 'DELETED') {
      throw createInvalidRefreshTokenError();
    }

    assertUserIsNotSuspended(existing.user);

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
    const accessToken = await this.signAccessTokenForUser(existing.user, existing.session.id);

    const nextRefreshToken = generateRefreshToken();
    const nextHash = hashRefreshToken(nextRefreshToken);

    const rotation = await this.repo.rotateRefreshToken(currentHash, nextHash, now, {
      ip: input.ip,
      userAgent: input.userAgent,
    });
    if (rotation.kind === 'not_found') {
      throw createInvalidRefreshTokenError();
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

    return { user: toAuthUserView(existing.user), accessToken, refreshToken: nextRefreshToken };
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    const now = this.clock.now();
    const hash = hashRefreshToken(input.refreshToken);
    const ok = await this.repo.revokeSessionByRefreshTokenHash(hash, now);
    if (!ok) {
      throw createInvalidRefreshTokenError();
    }
  }

  getPublicJwks(): Promise<unknown> {
    return this.accessTokens.getPublicJwks();
  }

  private async signAccessTokenForUser(user: AuthUserRecord, sessionId: string): Promise<string> {
    return await this.accessTokens.signAccessToken({
      userId: user.id,
      sessionId,
      emailVerified: user.emailVerifiedAt !== null,
      roles: [user.role],
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });
  }

  private async createSessionAndTokens(
    userId: string,
    input: {
      deviceId?: string;
      deviceName?: string;
      ip?: string;
      userAgent?: string;
      now: Date;
    },
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const activeKey = buildActiveSessionKey(userId, input.deviceId);
    if (activeKey) {
      await this.repo.revokeActiveSessionForDevice(userId, activeKey, input.now);
    }

    const sessionExpiresAt = sessionExpiresAtFrom(input.now, this.config.refreshTokenTtlSeconds);
    const session = await this.repo.createSession({
      userId,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      lastSeenAt: input.now,
      sessionExpiresAt,
      activeKey,
    });

    await this.repo.createRefreshToken(session.id, refreshTokenHash, session.expiresAt);

    return { sessionId: session.id, refreshToken };
  }
}
