import Redis from 'ioredis';
import { RedisService } from './redis.service';
import type { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';

type RedisClientStub = Readonly<{
  status: string;
  connect: () => Promise<void>;
  ping: () => Promise<void>;
  quit: () => Promise<void>;
  disconnect: () => void;
}>;

const clients: RedisClientStub[] = [];
const constructorCalls: Array<Readonly<{ url: string; options?: unknown }>> = [];

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn((url: string, options?: unknown) => {
      const status = typeof url === 'string' && url.includes('ready') ? 'ready' : 'wait';

      const client: RedisClientStub = {
        status,
        connect: jest.fn(async () => undefined),
        ping: jest.fn(async () => undefined),
        quit: jest.fn(async () => undefined),
        disconnect: jest.fn(() => undefined),
      };
      clients.push(client);
      constructorCalls.push({ url, options });
      return client;
    }),
  };
});

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
    clients.length = 0;
    constructorCalls.length = 0;
    jest.clearAllMocks();
  });

  it('reports disabled and throws getClient() when REDIS_URL is not configured', () => {
    const service = new RedisService(stubConfig({ NODE_ENV: NodeEnv.Development }));

    expect(service.isEnabled()).toBe(false);
    expect(() => service.getClient()).toThrow(/REDIS_URL is not configured/i);
  });

  it('does not connect on startup outside production-like envs', async () => {
    const service = new RedisService(
      stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );
    expect(service.isEnabled()).toBe(true);

    await service.onModuleInit();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('connects and pings on startup in production-like envs', async () => {
    const service = new RedisService(
      stubConfig({ NODE_ENV: NodeEnv.Production, REDIS_URL: 'redis://unused' }),
    );
    expect(service.isEnabled()).toBe(true);

    await service.onModuleInit();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it('disconnects on destroy for a never-connected lazy client', async () => {
    const service = new RedisService(
      stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );

    await service.onModuleDestroy();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('tries quit on destroy when already connected', async () => {
    const service = new RedisService(
      stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://ready' }),
    );

    await service.onModuleDestroy();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to disconnect when quit fails', async () => {
    const service = new RedisService(
      stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://ready' }),
    );

    const client = clients[0] as unknown as { quit: jest.Mock<Promise<void>, []> };
    client.quit.mockImplementationOnce(async () => {
      throw new Error('redis down');
    });

    await service.onModuleDestroy();

    const raw = clients[0] as unknown as { disconnect: jest.Mock<void, []> };
    expect(raw.disconnect).toHaveBeenCalledTimes(1);
  });

  it('only uses the Redis constructor when enabled', () => {
    new RedisService(stubConfig({ NODE_ENV: NodeEnv.Development }));
    expect((Redis as unknown as jest.Mock).mock.calls).toHaveLength(0);

    new RedisService(stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }));
    expect((Redis as unknown as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('applies explicit Redis reliability defaults', () => {
    new RedisService(stubConfig({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }));

    const ctor = constructorCalls[0] as { options?: Record<string, unknown> } | undefined;
    expect(ctor).toBeDefined();
    expect(ctor?.options?.lazyConnect).toBe(true);
    expect(ctor?.options?.connectTimeout).toBe(10_000);
    expect(ctor?.options?.commandTimeout).toBe(5_000);
    expect(ctor?.options?.maxRetriesPerRequest).toBe(2);
    expect(ctor?.options?.enableOfflineQueue).toBe(true);
    expect(typeof ctor?.options?.retryStrategy).toBe('function');

    const retryStrategy = ctor?.options?.retryStrategy as ((times: number) => number) | undefined;
    expect(retryStrategy?.(1)).toBe(100);
    expect(retryStrategy?.(50)).toBe(2_000);
  });

  it('applies Redis reliability env overrides', () => {
    new RedisService(
      stubConfig({
        NODE_ENV: NodeEnv.Development,
        REDIS_URL: 'redis://unused',
        REDIS_CONNECT_TIMEOUT_MS: 1500,
        REDIS_COMMAND_TIMEOUT_MS: 900,
        REDIS_MAX_RETRIES_PER_REQUEST: 4,
        REDIS_RETRY_BASE_DELAY_MS: 50,
        REDIS_RETRY_MAX_DELAY_MS: 500,
        REDIS_ENABLE_OFFLINE_QUEUE: true,
      }),
    );

    const ctor = constructorCalls[0] as { options?: Record<string, unknown> } | undefined;
    expect(ctor?.options?.connectTimeout).toBe(1500);
    expect(ctor?.options?.commandTimeout).toBe(900);
    expect(ctor?.options?.maxRetriesPerRequest).toBe(4);
    expect(ctor?.options?.enableOfflineQueue).toBe(true);
    const retryStrategy = ctor?.options?.retryStrategy as ((times: number) => number) | undefined;
    expect(retryStrategy?.(1)).toBe(50);
    expect(retryStrategy?.(20)).toBe(500);
  });

  it('throws on invalid Redis timeout/retry settings', () => {
    expect(
      () =>
        new RedisService(
          stubConfig({
            NODE_ENV: NodeEnv.Development,
            REDIS_URL: 'redis://unused',
            REDIS_COMMAND_TIMEOUT_MS: 0,
          }),
        ),
    ).toThrow(/REDIS_COMMAND_TIMEOUT_MS/i);
  });
});
