import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('throws on invalid PORT', () => {
    expect(() => validateEnv({ PORT: 'not-a-number' })).toThrow(/PORT/i);
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/i);
  });

  it('throws on invalid LOG_PRETTY', () => {
    expect(() => validateEnv({ LOG_PRETTY: 'maybe' })).toThrow(/LOG_PRETTY/i);
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

  it('throws on invalid USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS', () => {
    expect(() => validateEnv({ USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS: 'nope' })).toThrow(
      /USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS/i,
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

  it('throws when FCM env is set without PUSH_PROVIDER', () => {
    expect(() => validateEnv({ FCM_PROJECT_ID: 'project' })).toThrow(/PUSH_PROVIDER/i);
  });

  it('throws when PUSH_PROVIDER=FCM is missing required vars', () => {
    expect(() => validateEnv({ PUSH_PROVIDER: 'FCM' })).toThrow(/FCM_PROJECT_ID/i);
  });

  it('allows PUSH_PROVIDER=FCM with ADC', () => {
    expect(() =>
      validateEnv({
        PUSH_PROVIDER: 'FCM',
        FCM_PROJECT_ID: 'project',
        FCM_USE_APPLICATION_DEFAULT: 'true',
      }),
    ).not.toThrow();
  });

  it('allows PUSH_PROVIDER=FCM with base64 service account JSON', () => {
    const json = JSON.stringify({
      project_id: 'project',
      client_email: 'svc@example.com',
      private_key: 'key',
    });
    const base64 = Buffer.from(json, 'utf8').toString('base64');

    expect(() =>
      validateEnv({
        PUSH_PROVIDER: 'FCM',
        FCM_PROJECT_ID: 'project',
        FCM_SERVICE_ACCOUNT_JSON_BASE64: base64,
      }),
    ).not.toThrow();
  });
});
