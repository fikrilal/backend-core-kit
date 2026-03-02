import {
  DEFAULT_AUTH_PASSWORD_MIN_LENGTH,
  resolveAuthPasswordMinLength,
} from './auth-password-policy';

describe('auth-password-policy', () => {
  it('returns default when the env value is missing', () => {
    expect(resolveAuthPasswordMinLength({})).toBe(DEFAULT_AUTH_PASSWORD_MIN_LENGTH);
  });

  it('returns parsed value when the env value is valid', () => {
    expect(resolveAuthPasswordMinLength({ AUTH_PASSWORD_MIN_LENGTH: '14' })).toBe(14);
  });

  it('returns default when the env value is invalid', () => {
    expect(resolveAuthPasswordMinLength({ AUTH_PASSWORD_MIN_LENGTH: 'nope' })).toBe(
      DEFAULT_AUTH_PASSWORD_MIN_LENGTH,
    );
  });

  it('returns default when the env value is not an integer', () => {
    expect(resolveAuthPasswordMinLength({ AUTH_PASSWORD_MIN_LENGTH: '10.5' })).toBe(
      DEFAULT_AUTH_PASSWORD_MIN_LENGTH,
    );
  });
});
