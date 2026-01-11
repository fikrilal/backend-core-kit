import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

@Injectable()
export class RedisEmailVerificationRateLimiter {
  private readonly cooldownSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cooldownSeconds = asPositiveInt(
      this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS'),
      60,
    );
  }

  async assertResendAllowed(userId: string): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const key = `auth:email-verification:resend:user:${userId}`;
    const client = this.redis.getClient();
    const ok = await client.set(key, '1', 'EX', this.cooldownSeconds, 'NX');
    if (ok === 'OK') return;

    throw new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many verification email requests. Try again later.',
    });
  }
}
