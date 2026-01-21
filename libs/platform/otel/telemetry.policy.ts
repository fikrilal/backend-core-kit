import { NodeEnv } from '../config/env.validation';

export function isTelemetryEnabled(nodeEnv: NodeEnv, otlpEndpoint: unknown): boolean {
  if (nodeEnv === NodeEnv.Test) return false;
  if (typeof otlpEndpoint !== 'string') return false;
  return otlpEndpoint.trim() !== '';
}
