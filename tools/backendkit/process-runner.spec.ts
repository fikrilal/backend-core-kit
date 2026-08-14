import type { ProcessRequest } from './process-runner';
import { npmInvocation, runProcess } from './process-runner';

describe('runProcess', () => {
  it('captures successful process output without a shell', async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("ready")'],
      stdio: 'pipe',
    });

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('ready');
    expect(result.stderr).toBe('');
  });

  it('returns non-zero exits as structured results', async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', 'process.stderr.write("failed"); process.exit(7)'],
      stdio: 'pipe',
    });

    expect(result.code).toBe(7);
    expect(result.stderr).toBe('failed');
  });

  it('terminates a process after its timeout', async () => {
    const request: ProcessRequest = {
      command: process.execPath,
      args: ['-e', 'setInterval(() => undefined, 1000)'],
      stdio: 'pipe',
      timeoutMs: 30,
      terminateGraceMs: 30,
    };

    const result = await runProcess(request);

    expect(result.timedOut).toBe(true);
    expect(result.code === null || result.code !== 0).toBe(true);
  });

  it('rejects invalid timeout values before starting a process', async () => {
    await expect(
      runProcess({ command: process.execPath, args: ['-e', ''], timeoutMs: 0 }),
    ).rejects.toThrow('Process timeout must be a positive finite number');
  });
});

describe('npmInvocation', () => {
  it('preserves npm arguments as structured values', () => {
    const invocation = npmInvocation(['run', 'lint']);

    expect(invocation.args).toContain('run');
    expect(invocation.args).toContain('lint');
  });
});
