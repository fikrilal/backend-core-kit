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

  it('throws when RESEND_API_KEY is set without EMAIL_FROM', () => {
    expect(() => validateEnv({ RESEND_API_KEY: 're_test' })).toThrow(/EMAIL_FROM/i);
  });

  it('throws when EMAIL_FROM is set without RESEND_API_KEY', () => {
    expect(() => validateEnv({ EMAIL_FROM: 'no-reply@example.com' })).toThrow(/RESEND_API_KEY/i);
  });

  it('throws when storage config is partial', () => {
    expect(() => validateEnv({ STORAGE_S3_BUCKET: 'my-bucket' })).toThrow(/STORAGE_S3_ENDPOINT/i);
  });
});
