import { normalizeEmail, type AuthConfig } from '../shared/auth.model';
import { AuthError, AuthErrorCode } from '../shared/auth.errors';
import { assertPasswordPolicy } from '../shared/auth.service.helpers';
import type { AuthRepository } from '../shared/ports/auth.repository';
import type { PasswordHasher } from '../shared/ports/auth.ports';
import type { Clock } from '../../../shared/time';
import { hashPasswordResetToken } from './password-reset-token';

export class AuthPasswordResetService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
  ) {}

  async requestPasswordReset(input: {
    email: string;
  }): Promise<Readonly<{ userId: string }> | null> {
    const email = normalizeEmail(input.email);
    const userId = await this.repo.findUserIdByEmail(email);
    if (!userId) return null;
    return { userId };
  }

  async confirmPasswordReset(input: { token: string; newPassword: string }): Promise<void> {
    assertPasswordPolicy(input.newPassword, this.config.passwordMinLength);

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
}
