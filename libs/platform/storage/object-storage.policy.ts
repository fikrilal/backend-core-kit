export const MIN_PRESIGNED_URL_TTL_SECONDS = 1;
export const MAX_PRESIGNED_URL_TTL_SECONDS = 15 * 60;

export function assertPresignedUrlTtlSeconds(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(
      `Invalid presigned URL TTL: expected an integer between ${MIN_PRESIGNED_URL_TTL_SECONDS} and ${MAX_PRESIGNED_URL_TTL_SECONDS} seconds`,
    );
  }

  if (value < MIN_PRESIGNED_URL_TTL_SECONDS || value > MAX_PRESIGNED_URL_TTL_SECONDS) {
    throw new Error(
      `Invalid presigned URL TTL: expected ${MIN_PRESIGNED_URL_TTL_SECONDS}-${MAX_PRESIGNED_URL_TTL_SECONDS} seconds`,
    );
  }

  return value;
}

export function assertObjectKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === '' || trimmed !== key) {
    throw new Error('Invalid object key: expected a non-empty, trimmed string');
  }

  if (key.length > 1024) {
    throw new Error('Invalid object key: exceeds 1024 characters');
  }

  if (key.startsWith('/')) {
    throw new Error('Invalid object key: must not start with "/"');
  }

  if (key.includes('\0')) {
    throw new Error('Invalid object key: contains NUL');
  }

  const segments = key.split('/');
  for (const segment of segments) {
    if (segment === '') {
      throw new Error('Invalid object key: contains empty path segment');
    }
    if (segment === '.' || segment === '..') {
      throw new Error('Invalid object key: contains reserved path segment');
    }
  }

  return key;
}
