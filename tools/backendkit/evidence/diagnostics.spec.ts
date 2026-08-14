import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DiagnosticStore, MAX_DIAGNOSTIC_BYTES, sanitizeDiagnostics } from './diagnostics';

describe('transient diagnostics', () => {
  it('redacts representative secret shapes', () => {
    const source = [
      'Bearer bearer-secret',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
      'DATABASE_URL=postgresql://user:password@localhost/db',
      'REDIS_URL: redis://:secret@localhost:6379',
      'https://user:password@example.com/path',
      'Cookie: session=secret',
      '-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----',
    ].join('\n');

    const sanitized = sanitizeDiagnostics(source);

    for (const secret of ['bearer-secret', 'signature', 'password', 'session=secret', 'private']) {
      expect(sanitized).not.toContain(secret);
    }
  });

  it('writes a private size-bounded diagnostic artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-diagnostics-'));
    const reference = await new DiagnosticStore(root).write('example-task', 1, 'verify.unit', {
      command: 'npm',
      args: ['test'],
      code: 1,
      signal: null,
      timedOut: false,
      durationMs: 10,
      stdout: 'x'.repeat(MAX_DIAGNOSTIC_BYTES * 2),
      stderr: 'TOKEN=secret-value',
    });
    const content = await readFile(join(root, reference.path), 'utf8');

    expect(reference.truncated).toBe(true);
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES + 1);
    expect(content).not.toContain('secret-value');
  });
});
