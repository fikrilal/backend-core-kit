import { normalizeEmail } from '../domain/email';
import { AuthErrorCode } from './auth.error-codes';
import { AuthError, EmailAlreadyExistsError } from './auth.errors';
import { ErrorCode } from '../../../shared/error-codes';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { PasswordHasher } from './ports/password-hasher';
import type { AuthRepository } from './ports/auth.repository';
import type { AuthResult } from './auth.types';
import type { Clock } from './time';
import type { AuthConfig } from './auth.config';
import {
  assertPasswordPolicy,
  assertUserIsNotSuspended,
  createInvalidCredentialsError,
} from './auth.service.helpers';
import type { AuthSessionLifecycleService } from './auth-session-lifecycle.service';

export class AuthPasswordAuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly loginRateLimiter: LoginRateLimiter,
    private readonly clock: Clock,
    private readonly dummyPasswordHash: string,
    private readonly config: AuthConfig,
    private readonly sessions: AuthSessionLifecycleService,
  ) {}

  async registerWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    assertPasswordPolicy(input.password, this.config.passwordMinLength);

    const passwordHash = await this.passwordHasher.hash(input.password);

    let user;
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
    return await this.sessions.issueTokensForNewSession(user, ['PASSWORD'], {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      now,
    });
  }

  async loginWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const now = this.clock.now();

    await this.loginRateLimiter.assertAllowed({ email, ip: input.ip });

    const found = await this.repo.findUserForLogin(email);
    const passwordHash = found?.passwordHash ?? this.dummyPasswordHash;
    const verified = await this.passwordHasher.verify(passwordHash, input.password);
    const ok = found !== null && verified;

    if (!ok || !found) {
      await this.loginRateLimiter.recordFailure({ email, ip: input.ip });
      throw createInvalidCredentialsError();
    }

    if (found.user.status === 'DELETED') {
      await this.loginRateLimiter.recordFailure({ email, ip: input.ip });
      throw createInvalidCredentialsError();
    }

    assertUserIsNotSuspended(found.user);
    await this.loginRateLimiter.recordSuccess({ email, ip: input.ip });

    const authMethods = await this.repo.getAuthMethods(found.user.id);
    return await this.sessions.issueTokensForNewSession(found.user, authMethods, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      now,
    });
  }

  async changePassword(input: {
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    assertPasswordPolicy(input.newPassword, this.config.passwordMinLength);

    if (input.currentPassword === input.newPassword) {
      throw new AuthError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
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
      throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
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
}
