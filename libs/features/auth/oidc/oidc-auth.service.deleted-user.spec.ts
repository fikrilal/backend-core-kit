import { AuthErrorCode } from '../shared/auth.errors';
import type { AuthRepository } from '../shared/ports/auth.repository';
import type { AccessTokenIssuer, OidcIdTokenVerifier } from '../shared/ports/auth.ports';
import type { Clock } from '../../../shared/time';
import { normalizeEmail, type AuthConfig, type AuthUserRecord } from '../shared/auth.model';
import { ErrorCode } from '../../../shared/error-codes';
import { AuthSessionLifecycleService } from '../sessions/session-lifecycle.service';
import { AuthOidcAuthService } from './oidc-auth.service';

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

describe('AuthOidcAuthService (deleted user semantics)', () => {
  it('blocks OIDC exchange when external identity maps to a DELETED user', async () => {
    const repo = makeRepo({
      findUserByExternalIdentity: async () => makeUser({ status: 'DELETED' }),
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({
        kind: 'verified',
        identity: {
          provider: 'GOOGLE',
          subject: 'sub',
          email: 'User@Example.com',
          emailVerified: true,
        },
      }),
    };

    const accessTokens: AccessTokenIssuer = {
      signAccessToken: async () => 'access-token',
      getPublicJwks: async () => ({}),
    };
    const now = new Date('2026-01-11T14:00:00.000Z');
    const clock = fixedClock(now);
    const config: AuthConfig = {
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
      passwordMinLength: 10,
    };
    const sessions = new AuthSessionLifecycleService(repo, accessTokens, clock, config);
    const svc = new AuthOidcAuthService(repo, oidcVerifier, clock, sessions);

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    });
  });

  it('blocks connectOidc for DELETED users', async () => {
    const repo = makeRepo({
      findUserById: async () => makeUser({ status: 'DELETED' }),
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => unimplemented(),
    };

    const accessTokens: AccessTokenIssuer = {
      signAccessToken: async () => 'access-token',
      getPublicJwks: async () => ({}),
    };
    const now = new Date('2026-01-11T14:00:00.000Z');
    const clock = fixedClock(now);
    const config: AuthConfig = {
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
      passwordMinLength: 10,
    };
    const sessions = new AuthSessionLifecycleService(repo, accessTokens, clock, config);
    const svc = new AuthOidcAuthService(repo, oidcVerifier, clock, sessions);

    await expect(
      svc.connectOidc({ userId: 'user-1', provider: 'GOOGLE', idToken: 'token' }),
    ).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
