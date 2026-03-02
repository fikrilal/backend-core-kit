import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvVarsAuth } from './env.schema.auth';

const authDefaults = new EnvVarsAuth();
export const DEFAULT_AUTH_PASSWORD_MIN_LENGTH = authDefaults.AUTH_PASSWORD_MIN_LENGTH;

export function resolveAuthPasswordMinLength(env: Readonly<Record<string, unknown>>): number {
  const parsed = plainToInstance(
    EnvVarsAuth,
    { AUTH_PASSWORD_MIN_LENGTH: env.AUTH_PASSWORD_MIN_LENGTH },
    { enableImplicitConversion: true },
  );
  const errors = validateSync(parsed, { skipMissingProperties: true });
  if (errors.some((error) => error.property === 'AUTH_PASSWORD_MIN_LENGTH')) {
    return DEFAULT_AUTH_PASSWORD_MIN_LENGTH;
  }

  return parsed.AUTH_PASSWORD_MIN_LENGTH;
}
