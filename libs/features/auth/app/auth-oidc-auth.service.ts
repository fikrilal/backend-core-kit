import { normalizeEmail } from '../domain/email';
import { AuthErrorCode } from './auth.error-codes';
import {
  AuthError,
  EmailAlreadyExistsError,
  ExternalIdentityAlreadyExistsError,
} from './auth.errors';
import { ErrorCode } from '../../../shared/error-codes';
import type { AuthRepository } from './ports/auth.repository';
import type { OidcIdTokenVerifier, OidcProvider } from './ports/oidc-id-token-verifier';
import type { AuthResult } from './auth.types';
import type { Clock } from './time';
import type { AuthMethod } from '../../../shared/auth/auth-method';
import {
  assertUserIsNotSuspended,
  createInvalidCredentialsError,
  requireExistingNonDeletedUser,
  verifyOidcIdentityOrThrow,
} from './auth.service.helpers';
import type { AuthSessionLifecycleService } from './auth-session-lifecycle.service';

export class AuthOidcAuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly oidcVerifier: OidcIdTokenVerifier,
    private readonly clock: Clock,
    private readonly sessions: AuthSessionLifecycleService,
  ) {}

  async exchangeOidc(input: {
    provider: OidcProvider;
    idToken: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    const identity = await verifyOidcIdentityOrThrow(this.oidcVerifier, {
      provider: input.provider,
      idToken: input.idToken,
    });

    const now = this.clock.now();
    const email = normalizeEmail(identity.email);

    let user = await this.repo.findUserByExternalIdentity(identity.provider, identity.subject);
    let createdNewUser = false;

    if (!user) {
      const existingUserId = await this.repo.findUserIdByEmail(email);
      if (existingUserId) {
        throw new AuthError({
          status: 409,
          code: AuthErrorCode.AUTH_OIDC_LINK_REQUIRED,
          message:
            'We found an existing account for this email. Sign in with your password to link Google sign-in.',
        });
      }

      try {
        user = await this.repo.createUserWithExternalIdentity({
          email,
          emailVerifiedAt: now,
          profile: {
            ...(identity.displayName ? { displayName: identity.displayName } : {}),
            ...(identity.givenName ? { givenName: identity.givenName } : {}),
            ...(identity.familyName ? { familyName: identity.familyName } : {}),
          },
          externalIdentity: {
            provider: identity.provider,
            subject: identity.subject,
            email,
          },
        });
        createdNewUser = true;
      } catch (err: unknown) {
        if (err instanceof EmailAlreadyExistsError) {
          throw new AuthError({
            status: 409,
            code: AuthErrorCode.AUTH_OIDC_LINK_REQUIRED,
            message:
              'We found an existing account for this email. Sign in with your password to link Google sign-in.',
          });
        }
        if (err instanceof ExternalIdentityAlreadyExistsError) {
          const existing = await this.repo.findUserByExternalIdentity(
            identity.provider,
            identity.subject,
          );
          if (existing) user = existing;
          else throw err;
        } else {
          throw err;
        }
      }
    }

    if (user.status === 'DELETED') {
      throw createInvalidCredentialsError();
    }

    assertUserIsNotSuspended(user);

    const authMethods: ReadonlyArray<AuthMethod> = createdNewUser
      ? ['GOOGLE']
      : await this.repo.getAuthMethods(user.id);

    return await this.sessions.issueTokensForNewSession(user, authMethods, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      now,
    });
  }

  async connectOidc(input: {
    userId: string;
    provider: OidcProvider;
    idToken: string;
  }): Promise<void> {
    await requireExistingNonDeletedUser(this.repo, input.userId);

    const identity = await verifyOidcIdentityOrThrow(this.oidcVerifier, {
      provider: input.provider,
      idToken: input.idToken,
    });

    const now = this.clock.now();
    const email = normalizeEmail(identity.email);

    const result = await this.repo.linkExternalIdentityToUser({
      userId: input.userId,
      provider: identity.provider,
      subject: identity.subject,
      email,
      now,
    });

    if (result.kind === 'ok' || result.kind === 'already_linked') return;

    if (result.kind === 'user_not_found') {
      throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    }

    if (result.kind === 'identity_linked_to_other_user') {
      throw new AuthError({
        status: 409,
        code: AuthErrorCode.AUTH_OIDC_IDENTITY_ALREADY_LINKED,
        message: 'This OIDC identity is already linked to another account',
      });
    }

    if (result.kind === 'provider_already_linked') {
      throw new AuthError({
        status: 409,
        code: AuthErrorCode.AUTH_OIDC_PROVIDER_ALREADY_LINKED,
        message: 'This provider is already linked to your account',
      });
    }

    // Exhaustiveness guard.
    throw new Error('Unexpected connectOidc result');
  }
}
