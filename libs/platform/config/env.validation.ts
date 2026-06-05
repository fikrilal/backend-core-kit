import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  assertEmailConfigConsistency,
  assertPushConfigConsistency,
  assertRedisConfigConsistency,
  assertStorageConfigConsistency,
  requireInProductionLike,
} from './env.invariants';
import { EnvVars } from './env.schema';

export { NodeEnv, PushProvider } from './env.enums';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorProperty(error: unknown): string {
  if (!isRecord(error)) return 'unknown';
  const property = Reflect.get(error, 'property');
  return typeof property === 'string' ? property : 'unknown';
}

function getErrorConstraints(error: unknown): Record<string, string> | undefined {
  if (!isRecord(error)) return undefined;
  const constraints = Reflect.get(error, 'constraints');
  if (!isRecord(constraints)) return undefined;

  const entries = Object.entries(constraints).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function getErrorChildren(error: unknown): unknown[] {
  if (!isRecord(error)) return [];
  const children = Reflect.get(error, 'children');
  return Array.isArray(children) ? children : [];
}

function formatValidationErrors(errors: unknown[]): string {
  const messages: string[] = [];

  for (const error of errors) {
    const property = getErrorProperty(error);
    const constraints = getErrorConstraints(error);
    if (constraints) {
      for (const msg of Object.values(constraints)) {
        messages.push(`${property}: ${msg}`);
      }
    }

    const children = getErrorChildren(error);
    if (children.length > 0) {
      messages.push(formatValidationErrors(children));
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
  assertRedisConfigConsistency(validated);
  return validated;
}
