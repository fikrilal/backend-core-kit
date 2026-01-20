import { NodeEnv, PushProvider } from './env.enums';
import type { EnvVars } from './env.schema';

export function requireInProductionLike(env: EnvVars) {
  const productionLike = env.NODE_ENV === NodeEnv.Production || env.NODE_ENV === NodeEnv.Staging;
  if (!productionLike) return;

  const missing: string[] = [];
  if (env.HTTP_TRUST_PROXY === undefined) missing.push('HTTP_TRUST_PROXY');
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.REDIS_URL) missing.push('REDIS_URL');
  if (!env.AUTH_ISSUER) missing.push('AUTH_ISSUER');
  if (!env.AUTH_AUDIENCE) missing.push('AUTH_AUDIENCE');
  if (!env.OTEL_SERVICE_NAME) missing.push('OTEL_SERVICE_NAME');
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) missing.push('OTEL_EXPORTER_OTLP_ENDPOINT');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${env.NODE_ENV}: ${missing.join(', ')}`,
    );
  }
}

export function assertEmailConfigConsistency(env: EnvVars) {
  const resendKey = env.RESEND_API_KEY?.trim();
  const emailFrom = env.EMAIL_FROM?.trim();

  const hasResendKey = typeof resendKey === 'string' && resendKey !== '';
  const hasFrom = typeof emailFrom === 'string' && emailFrom !== '';

  if (hasResendKey && !hasFrom) {
    throw new Error(
      'Missing required environment variables: EMAIL_FROM (required when RESEND_API_KEY is set)',
    );
  }

  if (hasFrom && !hasResendKey) {
    throw new Error(
      'Missing required environment variables: RESEND_API_KEY (required when EMAIL_FROM is set)',
    );
  }
}

export function assertStorageConfigConsistency(env: EnvVars) {
  const endpoint = env.STORAGE_S3_ENDPOINT?.trim();
  const region = env.STORAGE_S3_REGION?.trim();
  const bucket = env.STORAGE_S3_BUCKET?.trim();
  const accessKeyId = env.STORAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();

  const configured = Boolean(
    endpoint ||
    region ||
    bucket ||
    accessKeyId ||
    secretAccessKey ||
    env.STORAGE_S3_FORCE_PATH_STYLE,
  );
  if (!configured) return;

  const missing: string[] = [];
  if (!endpoint) missing.push('STORAGE_S3_ENDPOINT');
  if (!region) missing.push('STORAGE_S3_REGION');
  if (!bucket) missing.push('STORAGE_S3_BUCKET');
  if (!accessKeyId) missing.push('STORAGE_S3_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('STORAGE_S3_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(
        ', ',
      )} (required when STORAGE_S3_* is set)`,
    );
  }
}

export function assertPushConfigConsistency(env: EnvVars) {
  const provider = env.PUSH_PROVIDER;

  const hasAnyPushEnv = Boolean(
    provider ||
    env.FCM_PROJECT_ID?.trim() ||
    env.FCM_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    env.FCM_SERVICE_ACCOUNT_JSON?.trim() ||
    env.FCM_USE_APPLICATION_DEFAULT,
  );

  if (!hasAnyPushEnv) return;

  if (!provider) {
    throw new Error(
      'Missing required environment variables: PUSH_PROVIDER (required when FCM_* is set)',
    );
  }

  if (provider !== PushProvider.Fcm) {
    throw new Error(`Unsupported PUSH_PROVIDER: ${provider}`);
  }

  const missing: string[] = [];

  const projectId = env.FCM_PROJECT_ID?.trim();
  if (!projectId) missing.push('FCM_PROJECT_ID');

  const useAdc = env.FCM_USE_APPLICATION_DEFAULT === true;
  const hasServiceAccountPath = Boolean(env.FCM_SERVICE_ACCOUNT_JSON_PATH?.trim());
  const hasServiceAccountJson = Boolean(env.FCM_SERVICE_ACCOUNT_JSON?.trim());

  if (!useAdc && !hasServiceAccountPath && !hasServiceAccountJson) {
    missing.push('FCM_SERVICE_ACCOUNT_JSON_PATH or FCM_SERVICE_ACCOUNT_JSON');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')} (required when PUSH_PROVIDER=FCM)`,
    );
  }
}
