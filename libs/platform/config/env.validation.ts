import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  assertEmailConfigConsistency,
  assertPushConfigConsistency,
  assertStorageConfigConsistency,
  requireInProductionLike,
} from './env.invariants';
import { EnvVars } from './env.schema';

export { NodeEnv, PushProvider } from './env.enums';

function formatValidationErrors(errors: unknown[]): string {
  const messages: string[] = [];

  for (const error of errors) {
    if (!error || typeof error !== 'object') continue;
    const e = error as {
      property?: string;
      constraints?: Record<string, string>;
      children?: unknown[];
    };

    const property = typeof e.property === 'string' ? e.property : 'unknown';
    if (e.constraints) {
      for (const msg of Object.values(e.constraints)) {
        messages.push(`${property}: ${msg}`);
      }
    }

    if (Array.isArray(e.children) && e.children.length > 0) {
      messages.push(formatValidationErrors(e.children));
    }
  }

  return messages.filter((m) => m.trim() !== '').join('; ');
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${formatValidationErrors(errors)}`);
  }

  requireInProductionLike(validated);
  assertEmailConfigConsistency(validated);
  assertPushConfigConsistency(validated);
  assertStorageConfigConsistency(validated);
  return validated;
}
