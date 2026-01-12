import { FastifyAdapter } from '@nestjs/platform-fastify';
import qs from 'qs';

function parseEnvBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export function createFastifyAdapter(): FastifyAdapter {
  const trustProxy = parseEnvBoolean(process.env.HTTP_TRUST_PROXY);

  return new FastifyAdapter({
    ...(trustProxy !== undefined ? { trustProxy } : {}),
    routerOptions: {
      querystringParser: (str) =>
        qs.parse(str, {
          allowPrototypes: false,
          plainObjects: true,
          depth: 5,
          parameterLimit: 1000,
        }) as unknown as Record<string, unknown>,
    },
  });
}
