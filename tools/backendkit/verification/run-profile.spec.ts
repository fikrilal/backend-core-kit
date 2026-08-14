import type { ProcessRequest, ProcessResult, ProcessRunner } from '../process-runner';
import { VerificationStepError, runVerificationProfile, type TextOutput } from './run-profile';

class RecordingOutput implements TextOutput {
  value = '';

  write(message: string): void {
    this.value += message;
  }
}

class RecordingProcessRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const result = this.results.shift();
    if (!result) throw new Error('No process result configured');
    return result;
  }
}

function processResult(code: number): ProcessResult {
  return {
    command: 'npm',
    args: [],
    code,
    signal: null,
    timedOut: false,
    durationMs: 10,
    stdout: '',
    stderr: '',
  };
}

describe('runVerificationProfile', () => {
  it('runs expanded steps in profile order', async () => {
    const output = new RecordingOutput();
    const runner = new RecordingProcessRunner(Array.from({ length: 8 }, () => processResult(0)));

    await runVerificationProfile('fast', {
      cwd: '/workspace',
      env: {},
      processRunner: runner,
      output,
    });

    expect(runner.requests).toHaveLength(8);
    expect(runner.requests[0]?.args).toContain('format:check');
    expect(runner.requests.at(-1)?.args).toContain('openapi:lint');
    expect(output.value).toContain('fast completed successfully');
  });

  it('stops after the first failed step', async () => {
    const output = new RecordingOutput();
    const runner = new RecordingProcessRunner([processResult(0), processResult(3)]);

    await expect(
      runVerificationProfile('fast', {
        cwd: '/workspace',
        env: {},
        processRunner: runner,
        output,
      }),
    ).rejects.toBeInstanceOf(VerificationStepError);

    expect(runner.requests).toHaveLength(2);
    expect(output.value).not.toContain('completed successfully');
  });
});
