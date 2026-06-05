import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import {
  applyIpRateLimit,
  asNonEmptyString,
  asPositiveInt,
  getRetryAfterSeconds,
  type IpRateLimitConfig,
} from './rate-limit.utils';

type EmailVerificationRateLimitContext = Readonly<{
  userId: string;
  ip?: string;
}>;

@Injectable()
export class RedisEmailVerificationRateLimiter {
  private readonly cooldownSeconds: number;
  private readonly ipConfig: IpRateLimitConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cooldownSeconds = asPositiveInt(
      this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS'),
      60,
    );
    this.ipConfig = {
      maxAttempts: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS'),
        30,
      ),
      windowSeconds: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS'),
        5 * 60,
      ),
      blockSeconds: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS'),
        15 * 60,
      ),
    };
  }

  async assertResendAllowed(ctx: EmailVerificationRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();

    const ip = asNonEmptyString(ctx.ip);
    if (ip) {
      const retryAfterSeconds = await applyIpRateLimit({
        client,
        ip,
        keyPrefix: 'auth:email-verification:resend:ip',
        config: this.ipConfig,
      });
      if (retryAfterSeconds !== undefined) {
        throw this.rateLimited(retryAfterSeconds);
      }
    }

    const key = `auth:email-verification:resend:user:${ctx.userId}`;
    const ok = await client.set(key, '1', 'EX', this.cooldownSeconds, 'NX');
    if (ok === 'OK') return;

    const retryAfterSeconds = await getRetryAfterSeconds(client, key, this.cooldownSeconds);
    throw this.rateLimited(retryAfterSeconds);
  }

  private rateLimited(retryAfterSeconds: number): AuthError {
    return new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many verification email requests. Try again later.',
      retryAfterSeconds,
    });
  }
}
