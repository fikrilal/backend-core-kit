import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import type { ProcessResult } from '../process-runner';
import { writePrivateArtifact } from './private-artifact';

export const MAX_DIAGNOSTIC_BYTES = 16 * 1024;

export type DiagnosticReference = Readonly<{
  path: string;
  sha256: string;
  truncated: boolean;
}>;

export class DiagnosticStore {
  constructor(private readonly root: string) {}

  async write(
    taskId: string,
    attempt: number,
    failureCode: string,
    result: ProcessResult,
  ): Promise<DiagnosticReference> {
    const relativePath = `.tmp/backendkit/tasks/${taskId}/diagnostics/attempt-${attempt}.txt`;
    const sanitized = sanitizeDiagnostics(
      [`failure=${failureCode}`, result.stderr, result.stdout].filter(Boolean).join('\n'),
    );
    const bounded = boundUtf8(sanitized, MAX_DIAGNOSTIC_BYTES);
    await writePrivateArtifact(resolve(this.root, relativePath), `${bounded.value}\n`);
    return {
      path: relativePath,
      sha256: createHash('sha256').update(bounded.value).digest('hex'),
      truncated: bounded.truncated,
    };
  }
}

export function sanitizeDiagnostics(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\b(?:postgres(?:ql)?|redis|mysql|mongodb):\/\/[^\s]+/gi, '[REDACTED_CONNECTION_URL]')
    .replace(/\bhttps?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi, '[REDACTED_CREDENTIAL_URL]')
    .replace(
      /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL|REDIS_URL)[A-Z0-9_]*\s*[:=]\s*[^\s]+/gi,
      '[REDACTED_ASSIGNMENT]',
    )
    .replace(/^(?:set-cookie|cookie):.*$/gim, '[REDACTED_COOKIE]');
}

function boundUtf8(
  value: string,
  maximumBytes: number,
): Readonly<{ value: string; truncated: boolean }> {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maximumBytes) return { value, truncated: false };
  const marker = '[TRUNCATED]\n';
  const markerBytes = Buffer.byteLength(marker);
  const tail = bytes.subarray(bytes.length - (maximumBytes - markerBytes)).toString('utf8');
  return { value: `${marker}${tail}`, truncated: true };
}
