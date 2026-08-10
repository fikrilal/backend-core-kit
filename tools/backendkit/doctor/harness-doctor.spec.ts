import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProcessRequest, ProcessResult, ProcessRunner } from '../process-runner';
import { HarnessDoctor } from './harness-doctor';

describe('HarnessDoctor', () => {
  it('reports repository, policy, private state, and runtime readiness without values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-doctor-'));
    await mkdir(join(root, '.tmp', 'backendkit', 'tasks'), { recursive: true });
    const runner = new DoctorRunner(root, true);

    const report = await new HarnessDoctor(root, runner, async () => undefined).inspect();

    expect(report).toMatchObject({
      taskStates: 0,
      workspaces: 0,
      staleTasks: 0,
      runtimeReady: true,
    });
    expect(report.checks.map(({ id }) => id)).toEqual([
      'executable.git',
      'executable.node',
      'executable.npm',
      'repository.identity',
      'repository.private-state',
      'policy.schemas',
      'state.schemas',
      'state.lifecycle',
      'runtime.docker',
    ]);
    expect(JSON.stringify(report)).not.toMatch(/token|password|environment/i);
  });

  it('keeps unavailable Docker advisory while failing closed on required tools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-doctor-warning-'));
    const warning = await new HarnessDoctor(
      root,
      new DoctorRunner(root, false),
      async () => undefined,
    ).inspect();
    expect(warning.runtimeReady).toBe(false);
    expect(warning.checks.at(-1)).toMatchObject({ status: 'warning' });

    const broken = new DoctorRunner(root, true);
    broken.unavailable = 'npm';
    await expect(new HarnessDoctor(root, broken, async () => undefined).inspect()).rejects.toThrow(
      "'npm' is unavailable",
    );
  });
});

class DoctorRunner implements ProcessRunner {
  unavailable?: string;

  constructor(
    private readonly root: string,
    private readonly dockerReady: boolean,
  ) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    const unavailable = request.command === this.unavailable;
    const dockerFailure = request.command === 'docker' && !this.dockerReady;
    return {
      command: request.command,
      args: request.args,
      code: unavailable || dockerFailure ? 1 : 0,
      signal: null,
      timedOut: false,
      durationMs: 1,
      stdout: request.args.includes('--show-toplevel') ? `${this.root}\n` : '',
      stderr: '',
    };
  }
}
