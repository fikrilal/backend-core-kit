import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { NodeEnv } from '../config/env.validation';
import { createConfigService } from '../../../test/support/stubs';

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

describe('RedisService', () => {
  beforeEach(() => {
    clients.length = 0;
    constructorCalls.length = 0;
    jest.clearAllMocks();
  });

  it('reports disabled and throws getClient() when REDIS_URL is not configured', () => {
    const service = new RedisService(createConfigService({ NODE_ENV: NodeEnv.Development }));

    expect(service.isEnabled()).toBe(false);
    expect(() => service.getClient()).toThrow(/REDIS_URL is not configured/i);
  });

  it('does not connect on startup outside production-like envs', async () => {
    const service = new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );
    expect(service.isEnabled()).toBe(true);

    await service.onModuleInit();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('connects and pings on startup in production-like envs', async () => {
    const service = new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Production, REDIS_URL: 'redis://unused' }),
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
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );

    await service.onModuleDestroy();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('tries quit on destroy when already connected', async () => {
    const service = new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://ready' }),
    );

    await service.onModuleDestroy();

    const client = clients[0];
    expect(client).toBeDefined();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to disconnect when quit fails', async () => {
    const service = new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://ready' }),
    );

    const client = clients[0];
    if (!client) {
      throw new Error('Expected Redis client');
    }
    jest.mocked(client.quit).mockImplementationOnce(async () => {
      throw new Error('redis down');
    });

    await service.onModuleDestroy();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('only uses the Redis constructor when enabled', () => {
    new RedisService(createConfigService({ NODE_ENV: NodeEnv.Development }));
    expect(jest.mocked(Redis).mock.calls).toHaveLength(0);

    new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );
    expect(jest.mocked(Redis).mock.calls).toHaveLength(1);
  });

  it('applies explicit Redis reliability defaults', () => {
    new RedisService(
      createConfigService({ NODE_ENV: NodeEnv.Development, REDIS_URL: 'redis://unused' }),
    );

    const ctor = constructorCalls[0];
    expect(ctor).toBeDefined();
    const options =
      ctor && typeof ctor.options === 'object' && ctor.options !== null ? ctor.options : undefined;
    expect(options && 'lazyConnect' in options ? options.lazyConnect : undefined).toBe(true);
    expect(options && 'connectTimeout' in options ? options.connectTimeout : undefined).toBe(
      10_000,
    );
    expect(options && 'commandTimeout' in options ? options.commandTimeout : undefined).toBe(5_000);
    expect(
      options && 'maxRetriesPerRequest' in options ? options.maxRetriesPerRequest : undefined,
    ).toBe(2);
    expect(
      options && 'enableOfflineQueue' in options ? options.enableOfflineQueue : undefined,
    ).toBe(true);
    const retryStrategy =
      options && 'retryStrategy' in options && typeof options.retryStrategy === 'function'
        ? options.retryStrategy
        : undefined;
    expect(retryStrategy?.(1)).toBe(100);
    expect(retryStrategy?.(50)).toBe(2_000);
  });

  it('applies Redis reliability env overrides', () => {
    new RedisService(
      createConfigService({
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

    const ctor = constructorCalls[0];
    const options =
      ctor && typeof ctor.options === 'object' && ctor.options !== null ? ctor.options : undefined;
    expect(options && 'connectTimeout' in options ? options.connectTimeout : undefined).toBe(1500);
    expect(options && 'commandTimeout' in options ? options.commandTimeout : undefined).toBe(900);
    expect(
      options && 'maxRetriesPerRequest' in options ? options.maxRetriesPerRequest : undefined,
    ).toBe(4);
    expect(
      options && 'enableOfflineQueue' in options ? options.enableOfflineQueue : undefined,
    ).toBe(true);
    const retryStrategy =
      options && 'retryStrategy' in options && typeof options.retryStrategy === 'function'
        ? options.retryStrategy
        : undefined;
    expect(retryStrategy?.(1)).toBe(50);
    expect(retryStrategy?.(20)).toBe(500);
  });

  it('throws on invalid Redis timeout/retry settings', () => {
    expect(
      () =>
        new RedisService(
          createConfigService({
            NODE_ENV: NodeEnv.Development,
            REDIS_URL: 'redis://unused',
            REDIS_COMMAND_TIMEOUT_MS: 0,
          }),
        ),
    ).toThrow(/REDIS_COMMAND_TIMEOUT_MS/i);
  });
});
