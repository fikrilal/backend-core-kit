import { AuthErrorCode } from './auth.error-codes';
import { AuthError } from './auth.errors';
import {
  assertPasswordPolicy,
  toAuthUserView,
  verifyOidcIdentityOrThrow,
} from './auth.service.helpers';
import type { OidcIdTokenVerifier } from './ports/oidc-id-token-verifier';

describe('auth.service.helpers', () => {
  it('enforces minimum password length', () => {
    expect(() => assertPasswordPolicy('short', 8)).toThrow(AuthError);
  });

  it('clones auth methods in user view', () => {
    const methods = ['PASSWORD'] as const;
    const userView = toAuthUserView(
      {
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      methods,
    );

    expect(userView).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      emailVerified: true,
      authMethods: ['PASSWORD'],
    });
    expect(userView.authMethods).not.toBe(methods);
  });

  it('maps invalid OIDC token to stable auth error', async () => {
    const verifier = {
      verifyIdToken: async () => ({ kind: 'invalid' }),
    } as unknown as OidcIdTokenVerifier;

    await expect(
      verifyOidcIdentityOrThrow(verifier, {
        provider: 'GOOGLE',
        idToken: 'bad-token',
      }),
    ).rejects.toMatchObject({
      code: AuthErrorCode.AUTH_OIDC_TOKEN_INVALID,
      status: 401,
    });
  });
});
