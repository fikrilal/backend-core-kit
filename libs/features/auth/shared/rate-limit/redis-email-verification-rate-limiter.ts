import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_CONFIG_DEFAULTS } from '../../../../platform/config/env.defaults';
import { RedisService } from '../../../../platform/redis/redis.service';
import { asPositiveInt } from '../../../../platform/config/env-parsing';
import { asNonEmptyString } from '../../../../shared/string';
import {
  applyIpRateLimit,
  getRetryAfterSeconds,
  rateLimitError,
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
      AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    );
    this.ipConfig = {
      maxAttempts: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS'),
        AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS,
      ),
      windowSeconds: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS'),
        AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
      ),
      blockSeconds: asPositiveInt(
        this.config.get('AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS'),
        AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS,
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
        throw rateLimitError(
          'Too many verification email requests. Try again later.',
          retryAfterSeconds,
        );
      }
    }

    const key = `auth:email-verification:resend:user:${ctx.userId}`;
    const ok = await client.set(key, '1', 'EX', this.cooldownSeconds, 'NX');
    if (ok === 'OK') return;

    const retryAfterSeconds = await getRetryAfterSeconds(client, key, this.cooldownSeconds);
    throw rateLimitError(
      'Too many verification email requests. Try again later.',
      retryAfterSeconds,
    );
  }
}
