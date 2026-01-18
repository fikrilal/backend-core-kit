import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { UsersError } from '../../app/users.errors';

type RateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}>;

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

@Injectable()
export class RedisProfileImageUploadRateLimiter {
  private readonly userConfig: RateLimitConfig;
  private readonly ipConfig: RateLimitConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.userConfig = {
      maxAttempts: this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS') ?? 20,
      windowSeconds:
        this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS') ?? 60 * 60,
      blockSeconds:
        this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS') ?? 15 * 60,
    };

    this.ipConfig = {
      maxAttempts: this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS') ?? 60,
      windowSeconds:
        this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS') ?? 5 * 60,
      blockSeconds:
        this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS') ?? 15 * 60,
    };
  }

  async assertAllowed(ctx: { userId: string; ip?: string }): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();

    const userCountKey = `users:profile-image:upload:user:${ctx.userId}:requests`;
    const userBlockKey = `users:profile-image:upload:user:${ctx.userId}:blocked`;

    const userBlocked = await client.get(userBlockKey);
    if (userBlocked) throw this.rateLimited();

    const ip = typeof ctx.ip === 'string' && ctx.ip.trim() !== '' ? ctx.ip.trim() : undefined;
    const ipHash = ip ? hashKey(ip) : undefined;
    const ipCountKey = ipHash ? `users:profile-image:upload:ip:${ipHash}:requests` : undefined;
    const ipBlockKey = ipHash ? `users:profile-image:upload:ip:${ipHash}:blocked` : undefined;

    if (ipBlockKey) {
      const ipBlocked = await client.get(ipBlockKey);
      if (ipBlocked) throw this.rateLimited();
    }

    await this.bump(client, userCountKey, userBlockKey, this.userConfig);
    if (ipCountKey && ipBlockKey) {
      await this.bump(client, ipCountKey, ipBlockKey, this.ipConfig);
    }
  }

  private async bump(
    client: ReturnType<RedisService['getClient']>,
    countKey: string,
    blockKey: string,
    cfg: RateLimitConfig,
  ): Promise<void> {
    const count = await client.incr(countKey);
    if (count === 1) {
      await client.expire(countKey, cfg.windowSeconds);
    }

    if (count >= cfg.maxAttempts) {
      await client.set(blockKey, '1', 'EX', cfg.blockSeconds);
    }
  }

  private rateLimited(): UsersError {
    return new UsersError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many profile image upload requests. Try again later.',
    });
  }
}
