import type Redis from 'ioredis';
import { IdempotencyService } from './idempotency.service';
import type { RedisService } from '../../redis/redis.service';

function createRedisMock(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));

  const client = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  } as unknown as Redis;

  const redis = {
    isEnabled: () => true,
    getClient: () => client,
  } as unknown as RedisService;

  return { redis, client, store };
}

describe('IdempotencyService', () => {
  it('releases the lock instead of caching when the completed record would be too large', async () => {
    const redisKey = 'idempotency:v1:u:s:k';
    const requestHash = 'hash-1';

    const { redis, client, store } = createRedisMock({
      [redisKey]: JSON.stringify({
        v: 1,
        state: 'in_progress',
        requestHash,
        startedAt: Date.now(),
      }),
    });

    const svc = new IdempotencyService(redis);
    await svc.complete(redisKey, requestHash, 200, 'a'.repeat(70_000), {}, 60);

    expect(client.del).toHaveBeenCalledWith(redisKey);
    expect(store.has(redisKey)).toBe(false);
    // Should not have attempted to cache the completed record.
    expect(client.set).not.toHaveBeenCalled();
  });
});
