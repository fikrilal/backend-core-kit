import type { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';
import type { JwtAlg } from './auth.types';

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getNodeEnv(config: Pick<ConfigService, 'get'>): NodeEnv {
  const raw = config.get<string>('NODE_ENV');
  switch (raw) {
    case NodeEnv.Development:
    case NodeEnv.Test:
    case NodeEnv.Staging:
    case NodeEnv.Production:
      return raw;
    default:
      return NodeEnv.Development;
  }
}

export function normalizeJwtAlg(value: unknown): JwtAlg | undefined {
  const v = asNonEmptyString(value);
  if (!v) return undefined;
  const normalized = v.trim().toUpperCase();
  if (normalized === 'EDDSA') return 'EdDSA';
  if (normalized === 'RS256') return 'RS256';
  return undefined;
}
