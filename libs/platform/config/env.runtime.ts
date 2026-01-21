import { NodeEnv } from './env.enums';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

export function normalizeNodeEnv(raw: unknown): NodeEnv {
  if (typeof raw !== 'string') return NodeEnv.Development;
  const trimmed = raw.trim();
  switch (trimmed) {
    case NodeEnv.Development:
    case NodeEnv.Test:
    case NodeEnv.Staging:
    case NodeEnv.Production:
      return trimmed;
    default:
      return NodeEnv.Development;
  }
}

export function deriveServiceName(params: { otelServiceName: unknown; role: string }): string {
  const base = asNonEmptyString(params.otelServiceName) ?? 'backend-core-kit';
  return `${base}-${params.role}`;
}
