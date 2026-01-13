export const PROFILE_IMAGE_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const PROFILE_IMAGE_MAX_BYTES = 5_000_000;
export const PROFILE_IMAGE_PRESIGN_TTL_SECONDS = 10 * 60;
