import { FastifyAdapter } from '@nestjs/platform-fastify';
import qs from 'qs';

type NodeEnv = 'development' | 'test' | 'staging' | 'production';

function getNodeEnv(): NodeEnv {
  const raw = typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV : undefined;
  const env = raw?.trim().toLowerCase();
  if (env === 'production' || env === 'staging' || env === 'test') return env;
  return 'development';
}

function parseOptionalBooleanOrThrow(name: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return undefined;

  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  throw new Error(`Invalid ${name}: expected boolean, got "${String(value)}"`);
}

export function createFastifyAdapter(): FastifyAdapter {
  const nodeEnv = getNodeEnv();

  const trustProxy = parseOptionalBooleanOrThrow('HTTP_TRUST_PROXY', process.env.HTTP_TRUST_PROXY);
  const productionLike = nodeEnv === 'production' || nodeEnv === 'staging';
  if (productionLike && trustProxy === undefined) {
    throw new Error(`Missing required HTTP_TRUST_PROXY for NODE_ENV=${nodeEnv}`);
  }

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
