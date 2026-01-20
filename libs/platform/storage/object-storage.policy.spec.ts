import {
  assertObjectKey,
  assertPresignedUrlTtlSeconds,
  MAX_PRESIGNED_URL_TTL_SECONDS,
  MIN_PRESIGNED_URL_TTL_SECONDS,
} from './object-storage.policy';

describe('object-storage policy', () => {
  describe('assertPresignedUrlTtlSeconds', () => {
    it('accepts min and max bounds', () => {
      expect(assertPresignedUrlTtlSeconds(MIN_PRESIGNED_URL_TTL_SECONDS)).toBe(
        MIN_PRESIGNED_URL_TTL_SECONDS,
      );
      expect(assertPresignedUrlTtlSeconds(MAX_PRESIGNED_URL_TTL_SECONDS)).toBe(
        MAX_PRESIGNED_URL_TTL_SECONDS,
      );
    });

    it('rejects non-integers and out-of-range values', () => {
      expect(() => assertPresignedUrlTtlSeconds(0)).toThrow(/Invalid presigned URL TTL/i);
      expect(() => assertPresignedUrlTtlSeconds(-1)).toThrow(/Invalid presigned URL TTL/i);
      expect(() => assertPresignedUrlTtlSeconds(MAX_PRESIGNED_URL_TTL_SECONDS + 1)).toThrow(
        /Invalid presigned URL TTL/i,
      );
      expect(() => assertPresignedUrlTtlSeconds(Number.NaN)).toThrow(/Invalid presigned URL TTL/i);
      expect(() => assertPresignedUrlTtlSeconds(Number.POSITIVE_INFINITY)).toThrow(
        /Invalid presigned URL TTL/i,
      );
      expect(() => assertPresignedUrlTtlSeconds(1.5)).toThrow(/Invalid presigned URL TTL/i);
    });
  });

  describe('assertObjectKey', () => {
    it('accepts non-empty, trimmed keys', () => {
      expect(assertObjectKey('users/u1/profile-images/f1')).toBe('users/u1/profile-images/f1');
    });

    it('rejects empty, whitespace, or unsafe segments', () => {
      expect(() => assertObjectKey('')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey(' users/u1')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey('/users/u1')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey('users//u1')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey('users/./u1')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey('users/../u1')).toThrow(/Invalid object key/i);
      expect(() => assertObjectKey('users/u1\0x')).toThrow(/Invalid object key/i);
    });

    it('rejects overly long keys', () => {
      const key = `users/${'a'.repeat(1024)}`;
      expect(() => assertObjectKey(key)).toThrow(/Invalid object key/i);
    });
  });
});
