import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuthError } from '../../app/auth.errors';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';

type EmailVerificationRateLimitContext = Readonly<{
  userId: string;
  ip?: string;
}>;

type IpRateLimitConfig = Readonly<{
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

    const ip = typeof ctx.ip === 'string' && ctx.ip.trim() !== '' ? ctx.ip.trim() : undefined;
    if (ip) {
      const ipHash = hashKey(ip);
      const ipCountKey = `auth:email-verification:resend:ip:${ipHash}:requests`;
      const ipBlockKey = `auth:email-verification:resend:ip:${ipHash}:blocked`;

      const blocked = await client.get(ipBlockKey);
      if (blocked) throw this.rateLimited();

      await this.bumpIp(client, ipCountKey, ipBlockKey);
    }

    const key = `auth:email-verification:resend:user:${ctx.userId}`;
    const ok = await client.set(key, '1', 'EX', this.cooldownSeconds, 'NX');
    if (ok === 'OK') return;

    throw this.rateLimited();
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

  private rateLimited(): AuthError {
    return new AuthError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many verification email requests. Try again later.',
    });
  }
}
