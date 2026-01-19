import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginRateLimitContext, LoginRateLimiter } from '../../app/ports/login-rate-limiter';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { asNonEmptyString, asPositiveInt, getRetryAfterSeconds, hashKey } from './rate-limit.utils';

type RateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}>;

@Injectable()
export class RedisLoginRateLimiter implements LoginRateLimiter {
  private readonly configValues: RateLimitConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.configValues = {
      maxAttempts: asPositiveInt(this.config.get('AUTH_LOGIN_MAX_ATTEMPTS'), 10),
      windowSeconds: asPositiveInt(this.config.get('AUTH_LOGIN_WINDOW_SECONDS'), 60),
      blockSeconds: asPositiveInt(this.config.get('AUTH_LOGIN_BLOCK_SECONDS'), 15 * 60),
    };
  }

  async assertAllowed(ctx: LoginRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const keys = this.keysFor(ctx);

    let retryAfterSeconds = 0;

    if (keys.emailBlockKey) {
      const blocked = await client.get(keys.emailBlockKey);
      if (blocked) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          await getRetryAfterSeconds(client, keys.emailBlockKey, this.configValues.blockSeconds),
        );
      }
    }
    if (keys.ipBlockKey) {
      const blocked = await client.get(keys.ipBlockKey);
      if (blocked) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          await getRetryAfterSeconds(client, keys.ipBlockKey, this.configValues.blockSeconds),
        );
      }
    }

    if (retryAfterSeconds > 0) throw this.rateLimited(retryAfterSeconds);
  }

  async recordFailure(ctx: LoginRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const keys = this.keysFor(ctx);

    await Promise.all([
      keys.emailCountKey
        ? this.bump(client, keys.emailCountKey, keys.emailBlockKey)
        : Promise.resolve(),
      keys.ipCountKey ? this.bump(client, keys.ipCountKey, keys.ipBlockKey) : Promise.resolve(),
    ]);
  }

  async recordSuccess(ctx: LoginRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const keys = this.keysFor(ctx);

    const toDelete = [keys.emailCountKey, keys.ipCountKey].filter(
      (k): k is string => typeof k === 'string',
    );
    if (toDelete.length > 0) {
      await client.del(...toDelete);
    }
  }

  private keysFor(ctx: LoginRateLimitContext): {
    emailCountKey?: string;
    emailBlockKey?: string;
    ipCountKey?: string;
    ipBlockKey?: string;
  } {
    const emailKey = hashKey(ctx.email.trim().toLowerCase());
    const emailCountKey = `auth:login:email:${emailKey}:failures`;
    const emailBlockKey = `auth:login:email:${emailKey}:blocked`;

    const ip = asNonEmptyString(ctx.ip);
    const ipKey = ip ? hashKey(ip) : undefined;
    const ipCountKey = ipKey ? `auth:login:ip:${ipKey}:failures` : undefined;
    const ipBlockKey = ipKey ? `auth:login:ip:${ipKey}:blocked` : undefined;

    return { emailCountKey, emailBlockKey, ipCountKey, ipBlockKey };
  }

  private async bump(
    client: ReturnType<RedisService['getClient']>,
    countKey: string,
    blockKey: string | undefined,
  ): Promise<void> {
    const { maxAttempts, windowSeconds, blockSeconds } = this.configValues;
    const count = await client.incr(countKey);
    if (count === 1) {
      await client.expire(countKey, windowSeconds);
    }

    if (blockKey && count >= maxAttempts) {
      await client.set(blockKey, '1', 'EX', blockSeconds);
    }
  }

  private rateLimited(retryAfterSeconds: number): AuthError {
    return new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many login attempts. Try again later.',
      retryAfterSeconds,
    });
  }
}
