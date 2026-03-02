import { resolveAuthPasswordMinLength } from '../../../../../platform/config/auth-password-policy';

export const AUTH_PASSWORD_MIN_LENGTH: number = resolveAuthPasswordMinLength(process.env);
