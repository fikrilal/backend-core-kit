import { AuthErrorCode } from '../app/auth.error-codes';
import { AuthError } from '../app/auth.errors';
import { hashEmailVerificationToken } from './email-verification-token';
import type { AuthRepository } from '../app/ports/auth.repository';
import type { Clock } from '../app/time';
import { requireExistingNonDeletedUser } from '../app/auth.service.helpers';

export class AuthEmailVerificationService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async verifyEmail(input: { token: string }): Promise<void> {
    const now = this.clock.now();
    const tokenHash = hashEmailVerificationToken(input.token);

    const result = await this.repo.verifyEmailByTokenHash(tokenHash, now);
    if (result.kind === 'ok' || result.kind === 'already_verified') return;

    if (result.kind === 'token_expired') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_EXPIRED,
        message: 'Email verification token expired',
      });
    }

    throw new AuthError({
      status: 400,
      code: AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_INVALID,
      message: 'Email verification token is invalid',
    });
  }

  async getEmailVerificationStatus(userId: string): Promise<'verified' | 'unverified'> {
    const user = await requireExistingNonDeletedUser(this.repo, userId);
    return user.emailVerifiedAt !== null ? 'verified' : 'unverified';
  }
}
