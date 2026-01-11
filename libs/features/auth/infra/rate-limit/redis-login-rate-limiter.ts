import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { LoginRateLimitContext, LoginRateLimiter } from '../../app/ports/login-rate-limiter';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';

type RateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
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

    if (keys.emailBlockKey) {
      const blocked = await client.get(keys.emailBlockKey);
      if (blocked) throw this.rateLimited();
    }
    if (keys.ipBlockKey) {
      const blocked = await client.get(keys.ipBlockKey);
      if (blocked) throw this.rateLimited();
    }
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

    const ip = typeof ctx.ip === 'string' && ctx.ip.trim() !== '' ? ctx.ip.trim() : undefined;
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

  private rateLimited(): AuthError {
    return new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many login attempts. Try again later.',
    });
  }
}
