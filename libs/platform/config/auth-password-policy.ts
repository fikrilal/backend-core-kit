import { AUTH_CONFIG_DEFAULTS } from './env.defaults';
import { asPositiveInt } from './env-parsing';

export const DEFAULT_AUTH_PASSWORD_MIN_LENGTH = AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_MIN_LENGTH;

export function resolveAuthPasswordMinLength(env: Readonly<Record<string, unknown>>): number {
  return asPositiveInt(env.AUTH_PASSWORD_MIN_LENGTH, DEFAULT_AUTH_PASSWORD_MIN_LENGTH);
}
