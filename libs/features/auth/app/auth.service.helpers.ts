import { AuthErrorCode } from './auth.error-codes';
import { AuthError } from './auth.errors';
import { ErrorCode } from '../../../shared/error-codes';
import type {
  OidcIdTokenVerifier,
  OidcProvider,
  VerifiedOidcIdentity,
} from './ports/oidc-id-token-verifier';
import type { AuthMethod } from '../../../shared/auth/auth-method';
import type { AuthUserRecord, AuthUserView } from './auth.types';

export async function verifyOidcIdentityOrThrow(
  oidcVerifier: OidcIdTokenVerifier,
  input: {
    provider: OidcProvider;
    idToken: string;
  },
): Promise<VerifiedOidcIdentity> {
  const verified = await oidcVerifier.verifyIdToken({
    provider: input.provider,
    idToken: input.idToken,
  });

  if (verified.kind === 'not_configured') {
    throw new AuthError({
      status: 500,
      code: AuthErrorCode.AUTH_OIDC_NOT_CONFIGURED,
      message: 'OIDC is not configured',
    });
  }

  if (verified.kind === 'invalid') {
    throw new AuthError({
      status: 401,
      code: AuthErrorCode.AUTH_OIDC_TOKEN_INVALID,
      message: 'Invalid OIDC token',
    });
  }

  if (!verified.identity.emailVerified) {
    throw new AuthError({
      status: 400,
      code: AuthErrorCode.AUTH_OIDC_EMAIL_NOT_VERIFIED,
      message: 'Email is not verified',
    });
  }

  return verified.identity;
}

export function createInvalidCredentialsError(): AuthError {
  return new AuthError({
    status: 401,
    code: AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    message: 'Invalid credentials',
  });
}

export function createInvalidRefreshTokenError(): AuthError {
  return new AuthError({
    status: 401,
    code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    message: 'Invalid refresh token',
  });
}

export function assertUserIsNotSuspended(user: AuthUserRecord): void {
  if (user.status !== 'SUSPENDED') return;
  throw new AuthError({
    status: 403,
    code: AuthErrorCode.AUTH_USER_SUSPENDED,
    message: 'User is suspended',
  });
}

export function toAuthUserView(
  user: AuthUserRecord,
  authMethods?: ReadonlyArray<AuthMethod>,
): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    ...(authMethods ? { authMethods: [...authMethods] } : {}),
  };
}

export function assertPasswordPolicy(password: string, minLength: number): void {
  if (typeof password !== 'string' || password.length < minLength) {
    throw new AuthError({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      issues: [{ field: 'password', message: `Password must be at least ${minLength} characters` }],
    });
  }
}

export function buildActiveSessionKey(userId: string, deviceId?: string): string | undefined {
  if (!deviceId) return undefined;
  return `${userId}:${deviceId}`;
}

export function sessionExpiresAtFrom(now: Date, refreshTokenTtlSeconds: number): Date {
  return new Date(now.getTime() + refreshTokenTtlSeconds * 1000);
}
