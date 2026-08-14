import type { VerificationProfileId } from './verification/profile-registry';
import { backendkitHelp, parseBackendkitCommand, runBackendkitCli } from './command';
import type { TextOutput } from './verification/run-profile';

class RecordingOutput implements TextOutput {
  value = '';

  write(message: string): void {
    this.value += message;
  }
}

describe('backendkit command', () => {
  it('uses fast as the default verification profile', () => {
    expect(parseBackendkitCommand(['verify'])).toEqual({ kind: 'verify', profile: 'fast' });
  });

  it('parses an explicit profile', () => {
    expect(parseBackendkitCommand(['verify', '--profile', 'runtime'])).toEqual({
      kind: 'verify',
      profile: 'runtime',
    });
  });

  it('parses structured task, risk, and knowledge commands', () => {
    expect(parseBackendkitCommand(['task', 'begin', '--plan', 'docs/plan.md'])).toEqual({
      kind: 'task-begin',
      planPath: 'docs/plan.md',
    });
    expect(parseBackendkitCommand(['task', 'preflight', '--task', 'example-task'])).toEqual({
      kind: 'task-preflight',
      taskId: 'example-task',
      action: 'verify',
    });
    expect(parseBackendkitCommand(['task', 'verify', '--task', 'example-task'])).toEqual({
      kind: 'task-verify',
      taskId: 'example-task',
    });
    expect(parseBackendkitCommand(['risk', 'classify', '--plan', 'docs/plan.md'])).toEqual({
      kind: 'risk-classify',
      planPath: 'docs/plan.md',
    });
    expect(parseBackendkitCommand(['knowledge', 'check'])).toEqual({ kind: 'knowledge-check' });
    expect(parseBackendkitCommand(['oracles', 'check'])).toEqual({ kind: 'oracles-check' });
    expect(parseBackendkitCommand(['evidence', 'check'])).toEqual({ kind: 'evidence-check' });
    expect(
      parseBackendkitCommand(['task', 'workspace', 'prepare', '--task', 'example-task']),
    ).toEqual({
      kind: 'task-workspace',
      operation: 'prepare',
      taskId: 'example-task',
    });
    expect(parseBackendkitCommand(['events', 'run', '--once'])).toEqual({
      kind: 'events-run-once',
    });
    expect(parseBackendkitCommand(['maintenance', 'run', '--once'])).toEqual({
      kind: 'maintenance-run-once',
    });
    expect(
      parseBackendkitCommand([
        'ci',
        'classify',
        '--base',
        'a'.repeat(40),
        '--head',
        'b'.repeat(40),
      ]),
    ).toEqual({ kind: 'ci-classify', base: 'a'.repeat(40), head: 'b'.repeat(40) });
    expect(
      parseBackendkitCommand([
        'handoff',
        'dry-run',
        '--task',
        'example-task',
        '--action',
        'commit',
      ]),
    ).toEqual({ kind: 'handoff-dry-run', taskId: 'example-task', action: 'commit' });
    expect(
      parseBackendkitCommand([
        'handoff',
        'draft-pr',
        '--task',
        'example-task',
        '--base',
        'development',
        '--title',
        'Verified change',
      ]),
    ).toEqual({
      kind: 'handoff-draft-pr',
      taskId: 'example-task',
      base: 'development',
      title: 'Verified change',
    });
  });

  it('rejects unknown commands and profiles', () => {
    expect(() => parseBackendkitCommand(['repair'])).toThrow("Unknown command 'repair'");
    expect(() => parseBackendkitCommand(['verify', '--profile', 'slow'])).toThrow(
      "Unknown verification profile 'slow'",
    );
  });

  it('runs the selected profile and returns success', async () => {
    const selected: VerificationProfileId[] = [];
    const stdout = new RecordingOutput();
    const stderr = new RecordingOutput();

    const exitCode = await runBackendkitCli(['verify', '--profile', 'full'], {
      runProfile: async (profile) => {
        selected.push(profile);
      },
      beginTask: async () => undefined,
      preflightTask: async () => undefined,
      verifyTask: async () => undefined,
      manageTaskWorkspace: async () => undefined,
      runEventsOnce: async () => undefined,
      runMaintenanceOnce: async () => undefined,
      classifyCi: async () => undefined,
      dryRunHandoff: async () => undefined,
      commitHandoff: async () => undefined,
      pushHandoff: async () => undefined,
      draftPrHandoff: async () => undefined,
      checkOracles: async () => undefined,
      checkEvidence: async () => undefined,
      classifyRisk: async () => undefined,
      checkKnowledge: async () => undefined,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(selected).toEqual(['full']);
    expect(stderr.value).toBe('');
  });

  it('returns usage errors separately from verification failures', async () => {
    const stdout = new RecordingOutput();
    const stderr = new RecordingOutput();
    const dependencies = {
      runProfile: async (): Promise<void> => undefined,
      beginTask: async (): Promise<void> => undefined,
      preflightTask: async (): Promise<void> => undefined,
      verifyTask: async (): Promise<void> => undefined,
      manageTaskWorkspace: async (): Promise<void> => undefined,
      runEventsOnce: async (): Promise<void> => undefined,
      runMaintenanceOnce: async (): Promise<void> => undefined,
      classifyCi: async (): Promise<void> => undefined,
      dryRunHandoff: async (): Promise<void> => undefined,
      commitHandoff: async (): Promise<void> => undefined,
      pushHandoff: async (): Promise<void> => undefined,
      draftPrHandoff: async (): Promise<void> => undefined,
      checkOracles: async (): Promise<void> => undefined,
      checkEvidence: async (): Promise<void> => undefined,
      classifyRisk: async (): Promise<void> => undefined,
      checkKnowledge: async (): Promise<void> => undefined,
      stdout,
      stderr,
    };

    expect(await runBackendkitCli(['unknown'], dependencies)).toBe(2);
    expect(stderr.value).toContain('Run backendkit --help for usage');

    stderr.value = '';
    expect(
      await runBackendkitCli(['verify'], {
        ...dependencies,
        runProfile: async () => {
          throw new Error('verification failed');
        },
      }),
    ).toBe(1);
    expect(stderr.value).toContain('verification failed');
  });

  it('documents every profile', () => {
    expect(backendkitHelp()).toContain('fast|full|runtime|ci');
    expect(backendkitHelp()).toContain('task begin');
    expect(backendkitHelp()).toContain('knowledge check');
    expect(backendkitHelp()).toContain('task workspace');
    expect(backendkitHelp()).toContain('events run --once');
    expect(backendkitHelp()).toContain('maintenance run --once');
    expect(backendkitHelp()).toContain('ci classify');
    expect(backendkitHelp()).toContain('handoff dry-run');
    expect(backendkitHelp()).toContain('oracles check');
    expect(backendkitHelp()).toContain('evidence check');
  });
});
