import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('throws on invalid PORT', () => {
    expect(() => validateEnv({ PORT: 'not-a-number' })).toThrow(/PORT/i);
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/i);
  });

  it('throws when production required env is missing', () => {
    expect(() => validateEnv({ NODE_ENV: NodeEnv.Production })).toThrow(/DATABASE_URL/i);
  });

  it('allows minimal config in development', () => {
    expect(() => validateEnv({ NODE_ENV: NodeEnv.Development })).not.toThrow();
  });
});
