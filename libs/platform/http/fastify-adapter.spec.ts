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
});
