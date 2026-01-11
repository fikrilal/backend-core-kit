import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { normalizeEmail } from '../../domain/email';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';

type PasswordResetRateLimitContext = Readonly<{
  email: string;
}>;

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

@Injectable()
export class RedisPasswordResetRateLimiter {
  private readonly cooldownSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cooldownSeconds = asPositiveInt(
      this.config.get('AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS'),
      60,
    );
  }

  async assertRequestAllowed(ctx: PasswordResetRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const emailHash = hashKey(normalizeEmail(ctx.email));
    const emailKey = `auth:password-reset:request:email:${emailHash}`;

    const client = this.redis.getClient();

    const emailOk = await client.set(emailKey, '1', 'EX', this.cooldownSeconds, 'NX');
    if (emailOk === 'OK') return;

    throw new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many password reset requests. Try again later.',
    });
  }
}
