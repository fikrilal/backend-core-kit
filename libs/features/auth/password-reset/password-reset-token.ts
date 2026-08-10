import { createHash, randomBytes } from 'crypto';

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('base64url');
}
