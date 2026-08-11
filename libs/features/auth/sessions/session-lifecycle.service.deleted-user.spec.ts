import { AuthErrorCode } from '../shared/auth.error-codes';
import type { AuthRepository, RefreshTokenWithSession } from '../shared/ports/auth.repository';
import type { AccessTokenIssuer } from '../shared/ports/access-token-issuer';
import type { Clock } from '../../../shared/time';
import { normalizeEmail } from '../shared/email';
import type { AuthUserRecord } from '../shared/auth.types';
import { AuthSessionLifecycleService } from './session-lifecycle.service';
import type { AuthConfig } from '../shared/auth.config';

function unimplemented(): never {
  throw new Error('Not implemented');
}

function fixedClock(now: Date): Clock {
  return { now: () => now };
}

function makeUser(partial?: Partial<AuthUserRecord>): AuthUserRecord {
  return {
    id: 'user-1',
    email: normalizeEmail('user@example.com'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    role: 'USER',
    status: 'ACTIVE',
    ...partial,
  };
}

function makeRepo(overrides: Partial<AuthRepository>): AuthRepository {
  return {
    createUserWithPassword: async () => unimplemented(),
    findUserIdByEmail: async () => unimplemented(),
    findUserForLogin: async () => unimplemented(),
    findUserById: async () => unimplemented(),
    getAuthMethods: async () => unimplemented(),
    findUserByExternalIdentity: async () => unimplemented(),
    createUserWithExternalIdentity: async () => unimplemented(),
    linkExternalIdentityToUser: async () => unimplemented(),
    listUserSessions: async () => unimplemented(),
    revokeSessionById: async () => unimplemented(),
    upsertSessionPushToken: async () => unimplemented(),
    revokeSessionPushToken: async () => unimplemented(),
    findPasswordCredential: async () => unimplemented(),
    verifyEmailByTokenHash: async () => unimplemented(),
    resetPasswordByTokenHash: async () => unimplemented(),
    changePasswordAndRevokeOtherSessions: async () => unimplemented(),
    findRefreshTokenWithSession: async () => unimplemented(),
    revokeActiveSessionForDevice: async () => unimplemented(),
    createSession: async () => unimplemented(),
    createRefreshToken: async () => unimplemented(),
    rotateRefreshToken: async () => unimplemented(),
    revokeSessionByRefreshTokenHash: async () => unimplemented(),
    ...overrides,
  };
}

describe('AuthSessionLifecycleService (deleted user semantics)', () => {
  it('blocks refresh when the user is DELETED', async () => {
    const now = new Date('2026-01-11T14:00:00.000Z');
    const existing: RefreshTokenWithSession = {
      token: {
        id: 'refresh-1',
        tokenHash: 'hash',
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        sessionId: 'session-1',
        replacedById: null,
      },
      session: {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
      },
      user: makeUser({ status: 'DELETED' }),
    };

    const repo = makeRepo({
      findRefreshTokenWithSession: async () => existing,
    });

    const accessTokens: AccessTokenIssuer = {
      signAccessToken: async () => 'access-token',
      getPublicJwks: async () => ({}),
    };
    const config: AuthConfig = {
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
      passwordMinLength: 10,
    };
    const lifecycle = new AuthSessionLifecycleService(repo, accessTokens, fixedClock(now), config);

    await expect(lifecycle.refresh({ refreshToken: 'refresh-token' })).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    });
  });
});
