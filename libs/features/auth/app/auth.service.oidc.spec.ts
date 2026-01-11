import { AuthService } from './auth.service';
import { AuthErrorCode } from './auth.error-codes';
import { EmailAlreadyExistsError, ExternalIdentityAlreadyExistsError } from './auth.errors';
import type { AuthRepository, RefreshTokenRecord, SessionRecord } from './ports/auth.repository';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { OidcIdTokenVerifier } from './ports/oidc-id-token-verifier';
import type { PasswordHasher } from './ports/password-hasher';
import type { Clock } from './time';
import type { Email } from '../domain/email';
import type { AuthUserRecord } from './auth.types';

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
    ...partial,
  };
}

describe('AuthService.exchangeOidc', () => {
  const dummyHasher: PasswordHasher = {
    hash: async () => 'hash',
    verify: async () => true,
  };

  const dummyRateLimiter: LoginRateLimiter = {
    assertAllowed: async () => undefined,
    recordFailure: async () => undefined,
    recordSuccess: async () => undefined,
  };

  const accessTokens: AccessTokenIssuer = {
    signAccessToken: async () => 'access-token',
    getPublicJwks: async () => ({}),
  };

  const now = new Date('2026-01-11T14:00:00.000Z');
  const clock = fixedClock(now);

  function makeRepo(overrides: Partial<AuthRepository>): AuthRepository {
    return {
      createUserWithPassword: async () => unimplemented(),
      findUserIdByEmail: async () => null,
      findUserForLogin: async () => unimplemented(),
      findUserById: async () => unimplemented(),
      findUserByExternalIdentity: async () => null,
      createUserWithExternalIdentity: async () => unimplemented(),
      listUserSessions: async () => unimplemented(),
      revokeSessionById: async () => unimplemented(),
      findPasswordCredential: async () => unimplemented(),
      verifyEmailByTokenHash: async () => unimplemented(),
      resetPasswordByTokenHash: async () => unimplemented(),
      changePasswordAndRevokeOtherSessions: async () => unimplemented(),
      findRefreshTokenWithSession: async () => unimplemented(),
      revokeActiveSessionForDevice: async () => undefined,
      createSession: async (input): Promise<SessionRecord> => ({
        id: 'session-1',
        expiresAt: input.sessionExpiresAt,
      }),
      createRefreshToken: async (
        sessionId: string,
        tokenHash: string,
        expiresAt: Date,
      ): Promise<RefreshTokenRecord> => ({
        id: 'refresh-1',
        tokenHash,
        expiresAt,
        revokedAt: null,
        sessionId,
        replacedById: null,
      }),
      rotateRefreshToken: async () => unimplemented(),
      revokeSessionByRefreshTokenHash: async () => unimplemented(),
      ...overrides,
    };
  }

  function makeService(params: {
    repo: AuthRepository;
    oidcVerifier: OidcIdTokenVerifier;
  }): AuthService {
    return new AuthService(
      params.repo,
      dummyHasher,
      accessTokens,
      params.oidcVerifier,
      dummyRateLimiter,
      clock,
      'dummy-password-hash',
      {
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
        passwordMinLength: 10,
      },
    );
  }

  it('returns 500 AUTH_OIDC_NOT_CONFIGURED when provider is not configured', async () => {
    const repo = makeRepo({});
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({ kind: 'not_configured' }),
    };

    const svc = makeService({ repo, oidcVerifier });

    await expect(
      svc.exchangeOidc({
        provider: 'GOOGLE',
        idToken: 'token',
        deviceId: 'd1',
        deviceName: 'Device',
      }),
    ).rejects.toMatchObject({
      status: 500,
      code: AuthErrorCode.AUTH_OIDC_NOT_CONFIGURED,
    });
  });

  it('returns 401 AUTH_OIDC_TOKEN_INVALID when token is invalid', async () => {
    const repo = makeRepo({});
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({ kind: 'invalid' }),
    };

    const svc = makeService({ repo, oidcVerifier });

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 401,
      code: AuthErrorCode.AUTH_OIDC_TOKEN_INVALID,
    });
  });

  it('returns 400 AUTH_OIDC_EMAIL_NOT_VERIFIED when email_verified is false', async () => {
    const repo = makeRepo({});
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({
        kind: 'verified',
        identity: {
          provider: 'GOOGLE',
          subject: 'sub',
          email: 'User@Example.com',
          emailVerified: false,
        },
      }),
    };

    const svc = makeService({ repo, oidcVerifier });

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 400,
      code: AuthErrorCode.AUTH_OIDC_EMAIL_NOT_VERIFIED,
    });
  });

  it('logs in when external identity is already linked', async () => {
    const user = makeUser({ email: 'linked@example.com' as Email });
    const repo = makeRepo({
      findUserByExternalIdentity: async () => user,
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({
        kind: 'verified',
        identity: {
          provider: 'GOOGLE',
          subject: 'sub',
          email: 'linked@example.com',
          emailVerified: true,
        },
      }),
    };

    const svc = makeService({ repo, oidcVerifier });
    const result = await svc.exchangeOidc({
      provider: 'GOOGLE',
      idToken: 'token',
      deviceId: 'device-1',
      deviceName: 'My Device',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.email).toBe('linked@example.com');
  });

  it('returns 409 AUTH_OIDC_LINK_REQUIRED when email exists but identity not linked', async () => {
    const repo = makeRepo({
      findUserByExternalIdentity: async () => null,
      findUserIdByEmail: async () => 'existing-user-id',
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({
        kind: 'verified',
        identity: {
          provider: 'GOOGLE',
          subject: 'sub',
          email: 'Existing@Example.com',
          emailVerified: true,
        },
      }),
    };

    const svc = makeService({ repo, oidcVerifier });

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 409,
      code: AuthErrorCode.AUTH_OIDC_LINK_REQUIRED,
    });
  });

  it('creates a new user + external identity when email is unused', async () => {
    const created = makeUser({
      id: 'created-user-id',
      email: 'new@example.com' as Email,
      emailVerifiedAt: now,
    });
    const repo = makeRepo({
      findUserByExternalIdentity: async () => null,
      findUserIdByEmail: async () => null,
      createUserWithExternalIdentity: async () => created,
    });
    const oidcVerifier: OidcIdTokenVerifier = {
      verifyIdToken: async () => ({
        kind: 'verified',
        identity: {
          provider: 'GOOGLE',
          subject: 'sub',
          email: 'New@Example.com',
          emailVerified: true,
          displayName: 'New User',
          givenName: 'New',
          familyName: 'User',
        },
      }),
    };

    const svc = makeService({ repo, oidcVerifier });
    const result = await svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' });

    expect(result.user.id).toBe('created-user-id');
    expect(result.user.email).toBe('new@example.com');
  });

  it('recovers when external identity is created concurrently', async () => {
    const linked = makeUser({ id: 'linked-id', email: 'user@example.com' as Email });
    let attempts = 0;

    const repo = makeRepo({
      findUserByExternalIdentity: async () => (attempts > 0 ? linked : null),
      findUserIdByEmail: async () => null,
      createUserWithExternalIdentity: async () => {
        attempts += 1;
        throw new ExternalIdentityAlreadyExistsError();
      },
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

    const svc = makeService({ repo, oidcVerifier });
    const result = await svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' });

    expect(result.user.id).toBe('linked-id');
  });

  it('maps email uniqueness to AUTH_OIDC_LINK_REQUIRED during create race', async () => {
    const repo = makeRepo({
      findUserByExternalIdentity: async () => null,
      findUserIdByEmail: async () => null,
      createUserWithExternalIdentity: async () => {
        throw new EmailAlreadyExistsError();
      },
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

    const svc = makeService({ repo, oidcVerifier });

    await expect(svc.exchangeOidc({ provider: 'GOOGLE', idToken: 'token' })).rejects.toMatchObject({
      status: 409,
      code: AuthErrorCode.AUTH_OIDC_LINK_REQUIRED,
    });
  });
});
