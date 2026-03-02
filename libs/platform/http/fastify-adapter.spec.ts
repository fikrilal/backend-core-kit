import { createFastifyAdapter } from './fastify-adapter';

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('createFastifyAdapter', () => {
  it('throws when HTTP_TRUST_PROXY is set but invalid', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'development', HTTP_TRUST_PROXY: 'maybe' }, () => createFastifyAdapter()),
    ).toThrow(/HTTP_TRUST_PROXY/i);
  });

  it('requires explicit HTTP_TRUST_PROXY in production-like environments', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'production', HTTP_TRUST_PROXY: undefined }, () =>
        createFastifyAdapter(),
      ),
    ).toThrow(/HTTP_TRUST_PROXY/i);
  });

  it('applies explicit timeout and body-limit defaults', () => {
    const adapter = withEnv(
      {
        NODE_ENV: 'development',
        HTTP_TRUST_PROXY: undefined,
        HTTP_CONNECTION_TIMEOUT_MS: undefined,
        HTTP_KEEP_ALIVE_TIMEOUT_MS: undefined,
        HTTP_REQUEST_TIMEOUT_MS: undefined,
        HTTP_BODY_LIMIT_BYTES: undefined,
        HTTP_PLUGIN_TIMEOUT_MS: undefined,
      },
      () => createFastifyAdapter(),
    );

    const instance = adapter.getInstance();
    expect(instance.initialConfig.connectionTimeout).toBe(10_000);
    expect(instance.initialConfig.keepAliveTimeout).toBe(72_000);
    expect(instance.server.requestTimeout).toBe(30_000);
    expect(instance.initialConfig.bodyLimit).toBe(1_048_576);
    expect(instance.initialConfig.pluginTimeout).toBe(10_000);
  });

  it('applies timeout and body-limit overrides from env', () => {
    const adapter = withEnv(
      {
        NODE_ENV: 'development',
        HTTP_CONNECTION_TIMEOUT_MS: '4500',
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '12000',
        HTTP_REQUEST_TIMEOUT_MS: '19000',
        HTTP_BODY_LIMIT_BYTES: '262144',
        HTTP_PLUGIN_TIMEOUT_MS: '7000',
      },
      () => createFastifyAdapter(),
    );

    const instance = adapter.getInstance();
    expect(instance.initialConfig.connectionTimeout).toBe(4500);
    expect(instance.initialConfig.keepAliveTimeout).toBe(12_000);
    expect(instance.server.requestTimeout).toBe(19_000);
    expect(instance.initialConfig.bodyLimit).toBe(262_144);
    expect(instance.initialConfig.pluginTimeout).toBe(7000);
  });

  it('throws on invalid timeout env values', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'development', HTTP_REQUEST_TIMEOUT_MS: '0' }, () =>
        createFastifyAdapter(),
      ),
    ).toThrow(/HTTP_REQUEST_TIMEOUT_MS/i);
  });
});
