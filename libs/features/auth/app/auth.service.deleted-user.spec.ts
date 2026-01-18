import { AuthService } from './auth.service';
import { AuthErrorCode } from './auth.error-codes';
import type { AuthRepository, RefreshTokenWithSession } from './ports/auth.repository';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { OidcIdTokenVerifier } from './ports/oidc-id-token-verifier';
import type { PasswordHasher } from './ports/password-hasher';
import type { Clock } from './time';
import type { Email } from '../domain/email';
import type { AuthUserRecord } from './auth.types';
import { ErrorCode } from '../../../shared/error-codes';

function unimplemented(): never {
  throw new Error('Not implemented');
}

function fixedClock(now: Date): Clock {
  return { now: () => now };
}

function makeUser(partial?: Partial<AuthUserRecord>): AuthUserRecord {
  return {
    id: 'user-1',
    email: 'user@example.com' as Email,
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

function makeService(params: {
  repo: AuthRepository;
  oidcVerifier: OidcIdTokenVerifier;
  passwordHasher: PasswordHasher;
  loginRateLimiter: LoginRateLimiter;
}): AuthService {
  const accessTokens: AccessTokenIssuer = {
    signAccessToken: async () => 'access-token',
    getPublicJwks: async () => ({}),
  };

  const now = new Date('2026-01-11T14:00:00.000Z');
  const clock = fixedClock(now);

  return new AuthService(
    params.repo,
    params.passwordHasher,
    accessTokens,
    params.oidcVerifier,
    params.loginRateLimiter,
    clock,
    'dummy-password-hash',
    {
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
      passwordMinLength: 10,
    },
  );
}

describe('AuthService (deleted user semantics)', () => {
  it('blocks password login for DELETED users', async () => {
    const repo = makeRepo({
      findUserForLogin: async () => ({
        user: makeUser({ status: 'DELETED' }),
        passwordHash: 'hash',
      }),
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => unimplemented(),
    };

    const loginRateLimiter: LoginRateLimiter = {
      assertAllowed: jest.fn(async () => undefined),
      recordFailure: jest.fn(async () => undefined),
      recordSuccess: jest.fn(async () => undefined),
    };

    const passwordHasher: PasswordHasher = {
      hash: async () => unimplemented(),
      verify: async () => true,
    };

    const svc = makeService({ repo, oidcVerifier, passwordHasher, loginRateLimiter });

    await expect(
      svc.loginWithPassword({ email: 'user@example.com', password: 'pw' }),
    ).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    });

    expect(loginRateLimiter.recordFailure).toHaveBeenCalledTimes(1);
    expect(loginRateLimiter.recordSuccess).toHaveBeenCalledTimes(0);
  });

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

    const loginRateLimiter: LoginRateLimiter = {
      assertAllowed: async () => undefined,
      recordFailure: async () => undefined,
      recordSuccess: async () => undefined,
    };

    const passwordHasher: PasswordHasher = {
      hash: async () => unimplemented(),
      verify: async () => unimplemented(),
    };

    const svc = makeService({ repo, oidcVerifier, passwordHasher, loginRateLimiter });

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    });
  });

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

    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => unimplemented(),
    };

    const loginRateLimiter: LoginRateLimiter = {
      assertAllowed: async () => undefined,
      recordFailure: async () => undefined,
      recordSuccess: async () => undefined,
    };

    const passwordHasher: PasswordHasher = {
      hash: async () => unimplemented(),
      verify: async () => unimplemented(),
    };

    const svc = makeService({ repo, oidcVerifier, passwordHasher, loginRateLimiter });

    await expect(svc.refresh({ refreshToken: 'refresh-token' })).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    });
  });

  it('blocks connectOidc for DELETED users', async () => {
    const repo = makeRepo({
      findUserById: async () => makeUser({ status: 'DELETED' }),
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => unimplemented(),
    };

    const loginRateLimiter: LoginRateLimiter = {
      assertAllowed: async () => undefined,
      recordFailure: async () => undefined,
      recordSuccess: async () => undefined,
    };

    const passwordHasher: PasswordHasher = {
      hash: async () => unimplemented(),
      verify: async () => unimplemented(),
    };

    const svc = makeService({ repo, oidcVerifier, passwordHasher, loginRateLimiter });

    await expect(
      svc.connectOidc({ userId: 'user-1', provider: 'GOOGLE', idToken: 'token' }),
    ).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
