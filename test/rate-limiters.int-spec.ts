import { createHash, randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { AuthError } from '../libs/features/auth/app/auth.errors';
import { RedisEmailVerificationRateLimiter } from '../libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter';
import { RedisLoginRateLimiter } from '../libs/features/auth/infra/rate-limit/redis-login-rate-limiter';
import { RedisPasswordResetRateLimiter } from '../libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter';
import { RedisProfileImageUploadRateLimiter } from '../libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter';
import { UsersError } from '../libs/features/users/app/users.errors';
import { RedisService } from '../libs/platform/redis/redis.service';

const redisUrl = process.env.REDIS_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !redisUrl;

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function expectTtlInRange(ttl: number, maxSeconds: number): void {
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(maxSeconds);
}

function expectAuthRateLimited(err: unknown): void {
  if (!(err instanceof AuthError)) {
    throw new Error(`Expected AuthError, got: ${String(err)}`);
  }
  expect(err.status).toBe(429);
  expect(err.code).toBe('RATE_LIMITED');
}

function expectUsersRateLimited(err: unknown): void {
  if (!(err instanceof UsersError)) {
    throw new Error(`Expected UsersError, got: ${String(err)}`);
  }
  expect(err.status).toBe(429);
  expect(err.code).toBe('RATE_LIMITED');
}

(shouldSkip ? describe.skip : describe)('Rate limiters (int)', () => {
  let redis: RedisService;
  const keysToCleanup: string[] = [];

  beforeAll(async () => {
    redis = new RedisService(stubConfig({ NODE_ENV: 'test', REDIS_URL: redisUrl }));
    await redis.ping();
  });

  afterEach(async () => {
    if (!redis.isEnabled()) return;
    const client = redis.getClient();
    while (keysToCleanup.length) {
      const key = keysToCleanup.pop();
      if (key) await client.del(key);
    }
  });

  afterAll(async () => {
    await redis.onModuleDestroy();
  });

  it('RedisLoginRateLimiter sets TTLs and blocks when max attempts is reached', async () => {
    const email = `login-ttl+${randomUUID()}@example.com`;
    const ip = '127.0.0.1';
    const emailHash = hashKey(email.toLowerCase());
    const ipHash = hashKey(ip);

    const emailCountKey = `auth:login:email:${emailHash}:failures`;
    const emailBlockKey = `auth:login:email:${emailHash}:blocked`;
    const ipCountKey = `auth:login:ip:${ipHash}:failures`;
    const ipBlockKey = `auth:login:ip:${ipHash}:blocked`;

    keysToCleanup.push(emailCountKey, emailBlockKey, ipCountKey, ipBlockKey);

    const limiter = new RedisLoginRateLimiter(
      stubConfig({
        AUTH_LOGIN_MAX_ATTEMPTS: '1',
        AUTH_LOGIN_WINDOW_SECONDS: '60',
        AUTH_LOGIN_BLOCK_SECONDS: '120',
      }),
      redis,
    );

    await limiter.recordFailure({ email, ip });

    const client = redis.getClient();
    expectTtlInRange(await client.ttl(emailCountKey), 60);
    expectTtlInRange(await client.ttl(emailBlockKey), 120);
    expectTtlInRange(await client.ttl(ipCountKey), 60);
    expectTtlInRange(await client.ttl(ipBlockKey), 120);

    let err: unknown;
    try {
      await limiter.assertAllowed({ email, ip });
    } catch (caught: unknown) {
      err = caught;
    }
    expectAuthRateLimited(err);
  });

  it('RedisPasswordResetRateLimiter sets TTLs and enforces cooldown', async () => {
    const email = `pw-reset-ttl+${randomUUID()}@example.com`;
    const ip = '127.0.0.2';

    const emailHash = hashKey(email.toLowerCase());
    const ipHash = hashKey(ip);

    const emailKey = `auth:password-reset:request:email:${emailHash}`;
    const ipCountKey = `auth:password-reset:request:ip:${ipHash}:requests`;
    const ipBlockKey = `auth:password-reset:request:ip:${ipHash}:blocked`;

    keysToCleanup.push(emailKey, ipCountKey, ipBlockKey);

    const limiter = new RedisPasswordResetRateLimiter(
      stubConfig({
        AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS: '60',
        AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS: '1',
        AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS: '60',
        AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS: '120',
      }),
      redis,
    );

    await limiter.assertRequestAllowed({ email, ip });

    const client = redis.getClient();
    expectTtlInRange(await client.ttl(emailKey), 60);
    expectTtlInRange(await client.ttl(ipCountKey), 60);
    expectTtlInRange(await client.ttl(ipBlockKey), 120);

    let err: unknown;
    try {
      await limiter.assertRequestAllowed({ email, ip });
    } catch (caught: unknown) {
      err = caught;
    }
    expectAuthRateLimited(err);
  });

  it('RedisEmailVerificationRateLimiter sets TTLs and enforces cooldown', async () => {
    const userId = randomUUID();
    const ip = '127.0.0.3';

    const ipHash = hashKey(ip);
    const userKey = `auth:email-verification:resend:user:${userId}`;
    const ipCountKey = `auth:email-verification:resend:ip:${ipHash}:requests`;
    const ipBlockKey = `auth:email-verification:resend:ip:${ipHash}:blocked`;

    keysToCleanup.push(userKey, ipCountKey, ipBlockKey);

    const limiter = new RedisEmailVerificationRateLimiter(
      stubConfig({
        AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: '60',
        AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS: '1',
        AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS: '60',
        AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS: '120',
      }),
      redis,
    );

    await limiter.assertResendAllowed({ userId, ip });

    const client = redis.getClient();
    expectTtlInRange(await client.ttl(userKey), 60);
    expectTtlInRange(await client.ttl(ipCountKey), 60);
    expectTtlInRange(await client.ttl(ipBlockKey), 120);

    let err: unknown;
    try {
      await limiter.assertResendAllowed({ userId, ip });
    } catch (caught: unknown) {
      err = caught;
    }
    expectAuthRateLimited(err);
  });

  it('RedisProfileImageUploadRateLimiter sets TTLs and enforces blocks', async () => {
    const userId = randomUUID();
    const ip = '127.0.0.4';
    const ipHash = hashKey(ip);

    const userCountKey = `users:profile-image:upload:user:${userId}:requests`;
    const userBlockKey = `users:profile-image:upload:user:${userId}:blocked`;
    const ipCountKey = `users:profile-image:upload:ip:${ipHash}:requests`;
    const ipBlockKey = `users:profile-image:upload:ip:${ipHash}:blocked`;

    keysToCleanup.push(userCountKey, userBlockKey, ipCountKey, ipBlockKey);

    const limiter = new RedisProfileImageUploadRateLimiter(
      stubConfig({
        USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS: '1',
        USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS: '60',
        USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS: '120',
        USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS: '1',
        USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS: '60',
        USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS: '120',
      }),
      redis,
    );

    await limiter.assertAllowed({ userId, ip });

    const client = redis.getClient();
    expectTtlInRange(await client.ttl(userCountKey), 60);
    expectTtlInRange(await client.ttl(userBlockKey), 120);
    expectTtlInRange(await client.ttl(ipCountKey), 60);
    expectTtlInRange(await client.ttl(ipBlockKey), 120);

    let err: unknown;
    try {
      await limiter.assertAllowed({ userId, ip });
    } catch (caught: unknown) {
      err = caught;
    }
    expectUsersRateLimited(err);
  });
});
