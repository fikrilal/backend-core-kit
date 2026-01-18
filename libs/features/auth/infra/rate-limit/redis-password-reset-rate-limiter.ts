import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeEmail } from '../../domain/email';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { asNonEmptyString, asPositiveInt, getRetryAfterSeconds, hashKey } from './rate-limit.utils';

type PasswordResetRateLimitContext = Readonly<{
  email: string;
  ip?: string;
}>;

type IpRateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}>;

@Injectable()
export class RedisPasswordResetRateLimiter {
  private readonly cooldownSeconds: number;
  private readonly ipConfig: IpRateLimitConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cooldownSeconds = asPositiveInt(
      this.config.get('AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS'),
      60,
    );
    this.ipConfig = {
      maxAttempts: asPositiveInt(
        this.config.get('AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS'),
        20,
      ),
      windowSeconds: asPositiveInt(
        this.config.get('AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS'),
        5 * 60,
      ),
      blockSeconds: asPositiveInt(
        this.config.get('AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS'),
        15 * 60,
      ),
    };
  }

  async assertRequestAllowed(ctx: PasswordResetRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const emailHash = hashKey(normalizeEmail(ctx.email));
    const emailKey = `auth:password-reset:request:email:${emailHash}`;

    const client = this.redis.getClient();

    const ip = asNonEmptyString(ctx.ip);
    if (ip) {
      const ipHash = hashKey(ip);
      const ipCountKey = `auth:password-reset:request:ip:${ipHash}:requests`;
      const ipBlockKey = `auth:password-reset:request:ip:${ipHash}:blocked`;

      const blocked = await client.get(ipBlockKey);
      if (blocked) {
        const retryAfterSeconds = await getRetryAfterSeconds(
          client,
          ipBlockKey,
          this.ipConfig.blockSeconds,
        );
        throw this.rateLimited(retryAfterSeconds);
      }

      await this.bumpIp(client, ipCountKey, ipBlockKey);
    }

    const emailOk = await client.set(emailKey, '1', 'EX', this.cooldownSeconds, 'NX');
    if (emailOk === 'OK') return;

    const retryAfterSeconds = await getRetryAfterSeconds(client, emailKey, this.cooldownSeconds);
    throw this.rateLimited(retryAfterSeconds);
  }

  private async bumpIp(
    client: ReturnType<RedisService['getClient']>,
    countKey: string,
    blockKey: string,
  ): Promise<void> {
    const { maxAttempts, windowSeconds, blockSeconds } = this.ipConfig;

    const count = await client.incr(countKey);
    if (count === 1) {
      await client.expire(countKey, windowSeconds);
    }

    if (count >= maxAttempts) {
      await client.set(blockKey, '1', 'EX', blockSeconds);
    }
  }

  private rateLimited(retryAfterSeconds: number): AuthError {
    return new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many password reset requests. Try again later.',
      retryAfterSeconds,
    });
  }
}
