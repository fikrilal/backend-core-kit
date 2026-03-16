import { FastifyAdapter } from '@nestjs/platform-fastify';
import qs from 'qs';

type NodeEnv = 'development' | 'test' | 'staging' | 'production';

type HttpServerPolicy = Readonly<{
  connectionTimeoutMs: number;
  keepAliveTimeoutMs: number;
  requestTimeoutMs: number;
  bodyLimitBytes: number;
  pluginTimeoutMs: number;
}>;

const DEFAULT_HTTP_SERVER_POLICY: HttpServerPolicy = Object.freeze({
  connectionTimeoutMs: 10_000,
  keepAliveTimeoutMs: 72_000,
  requestTimeoutMs: 30_000,
  bodyLimitBytes: 1_048_576,
  pluginTimeoutMs: 10_000,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function parsePositiveIntOrThrow(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const normalized = String(value).trim();
  if (normalized === '') return fallback;

  const n = Number(normalized);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer, got "${String(value)}"`);
  }
  return n;
}

function parseQueryString(str: string): Record<string, unknown> {
  const parsed = qs.parse(str, {
    allowPrototypes: false,
    plainObjects: true,
    depth: 5,
    parameterLimit: 1000,
  });

  return isRecord(parsed) ? parsed : {};
}

export function createFastifyAdapter(): FastifyAdapter {
  const nodeEnv = getNodeEnv();

  const trustProxy = parseOptionalBooleanOrThrow('HTTP_TRUST_PROXY', process.env.HTTP_TRUST_PROXY);
  const productionLike = nodeEnv === 'production' || nodeEnv === 'staging';
  if (productionLike && trustProxy === undefined) {
    throw new Error(`Missing required HTTP_TRUST_PROXY for NODE_ENV=${nodeEnv}`);
  }

  const connectionTimeout = parsePositiveIntOrThrow(
    'HTTP_CONNECTION_TIMEOUT_MS',
    process.env.HTTP_CONNECTION_TIMEOUT_MS,
    DEFAULT_HTTP_SERVER_POLICY.connectionTimeoutMs,
  );
  const keepAliveTimeout = parsePositiveIntOrThrow(
    'HTTP_KEEP_ALIVE_TIMEOUT_MS',
    process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    DEFAULT_HTTP_SERVER_POLICY.keepAliveTimeoutMs,
  );
  const requestTimeout = parsePositiveIntOrThrow(
    'HTTP_REQUEST_TIMEOUT_MS',
    process.env.HTTP_REQUEST_TIMEOUT_MS,
    DEFAULT_HTTP_SERVER_POLICY.requestTimeoutMs,
  );
  const bodyLimit = parsePositiveIntOrThrow(
    'HTTP_BODY_LIMIT_BYTES',
    process.env.HTTP_BODY_LIMIT_BYTES,
    DEFAULT_HTTP_SERVER_POLICY.bodyLimitBytes,
  );
  const pluginTimeout = parsePositiveIntOrThrow(
    'HTTP_PLUGIN_TIMEOUT_MS',
    process.env.HTTP_PLUGIN_TIMEOUT_MS,
    DEFAULT_HTTP_SERVER_POLICY.pluginTimeoutMs,
  );

  return new FastifyAdapter({
    ...(trustProxy !== undefined ? { trustProxy } : {}),
    connectionTimeout,
    keepAliveTimeout,
    requestTimeout,
    bodyLimit,
    pluginTimeout,
    routerOptions: {
      querystringParser: parseQueryString,
    },
  });
}
