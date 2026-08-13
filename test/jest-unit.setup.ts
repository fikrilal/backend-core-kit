// Unit-test env isolation.
//
// @nestjs/config's ConfigService falls back to process.env when a key is not
// present in the values passed to it. Platform specs construct services with
// `createConfigService({})` and assert the "not configured / disabled" path,
// so any real env vars exported by the developer shell would leak in and flip
// those assertions. Clear the service-relevant vars here so unit tests run in
// a deterministic, unconfigured environment regardless of the shell.

const SERVICE_ENV_VARS = [
  // email
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_REPLY_TO',
  // redis
  'REDIS_URL',
  'REDIS_TLS_REJECT_UNAUTHORIZED',
  'REDIS_CONNECT_TIMEOUT_MS',
  'REDIS_COMMAND_TIMEOUT_MS',
  'REDIS_MAX_RETRIES_PER_REQUEST',
  'REDIS_RETRY_BASE_DELAY_MS',
  'REDIS_RETRY_MAX_DELAY_MS',
  'REDIS_ENABLE_OFFLINE_QUEUE',
  // object storage
  'STORAGE_S3_ENDPOINT',
  'STORAGE_S3_REGION',
  'STORAGE_S3_BUCKET',
  'STORAGE_S3_ACCESS_KEY_ID',
  'STORAGE_S3_SECRET_ACCESS_KEY',
  'STORAGE_S3_FORCE_PATH_STYLE',
  // push
  'PUSH_PROVIDER',
  'FCM_PROJECT_ID',
  'FCM_SERVICE_ACCOUNT_JSON',
  'FCM_SERVICE_ACCOUNT_JSON_PATH',
  'FCM_SERVICE_ACCOUNT_JSON_BASE64',
  'FCM_USE_APPLICATION_DEFAULT',
  // access token verifier
  'AUTH_ISSUER',
  'AUTH_AUDIENCE',
];

for (const key of SERVICE_ENV_VARS) {
  delete process.env[key];
}
