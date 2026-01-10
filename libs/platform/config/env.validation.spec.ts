import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('throws on invalid PORT', () => {
    expect(() => validateEnv({ PORT: 'not-a-number' })).toThrow(/PORT/i);
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/i);
  });

  it('throws on invalid AUTH_PASSWORD_MIN_LENGTH', () => {
    expect(() => validateEnv({ AUTH_PASSWORD_MIN_LENGTH: 'nope' })).toThrow(
      /AUTH_PASSWORD_MIN_LENGTH/i,
    );
  });

  it('throws on invalid AUTH_LOGIN_MAX_ATTEMPTS', () => {
    expect(() => validateEnv({ AUTH_LOGIN_MAX_ATTEMPTS: 'zero' })).toThrow(
      /AUTH_LOGIN_MAX_ATTEMPTS/i,
    );
  });

  it('throws when production required env is missing', () => {
    expect(() => validateEnv({ NODE_ENV: NodeEnv.Production })).toThrow(/DATABASE_URL/i);
  });

  it('allows minimal config in development', () => {
    expect(() => validateEnv({ NODE_ENV: NodeEnv.Development })).not.toThrow();
  });
});
