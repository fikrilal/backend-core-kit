import { createHash, randomBytes } from 'crypto';

export function generateEmailVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashEmailVerificationToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('base64url');
}
