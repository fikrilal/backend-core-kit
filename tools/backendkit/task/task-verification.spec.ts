import type { DiagnosticReference } from '../evidence/diagnostics';
import type { TaskEpisode } from '../evidence/episode';
import type { ProcessResult } from '../process-runner';
import type { NpmVerificationStep } from '../verification/profile-registry';
import {
  VerificationStepError,
  type VerificationProfileRunResult,
} from '../verification/run-profile';
import type { TaskPreflightResult } from './task-service';
import {
  TaskVerificationController,
  TaskVerificationError,
  type DiagnosticWriter,
  type EpisodeWriter,
  type ProfileExecutor,
  type TaskPreflightService,
} from './task-verification';
import type { TaskState, TaskStateStore } from './task-state';

describe('task verification controller', () => {
  it('moves a successful high-risk harness task to ready for review', async () => {
    const fixture = verificationFixture();

    const result = await fixture.controller.verify('example-task');

    expect(fixture.profiles.requested).toEqual(['full']);
    expect(result).toMatchObject({ status: 'ready_for_review', reviewRequired: true });
    expect(fixture.states.state.status).toBe('ready_for_review');
    expect(fixture.episodes.values[0]).toMatchObject({
      finalStatus: 'ready_for_review',
      stopReason: 'verification.passed',
    });
  });

  it('adds runtime after full when task impact requires it', async () => {
    const fixture = verificationFixture({
      preflight: preflight({ database: true }),
      profileResults: [success('full'), success('runtime')],
    });

    await fixture.controller.verify('example-task');

    expect(fixture.profiles.requested).toEqual(['full', 'runtime']);
  });

  it('deduplicates stable risk identities in durable evidence', async () => {
    const value = preflight();
    const reason = value.classification.reasons[0];
    if (!reason) throw new Error('Missing risk fixture.');
    const fixture = verificationFixture({
      preflight: {
        ...value,
        classification: { ...value.classification, reasons: [reason, reason] },
      },
    });

    await fixture.controller.verify('example-task');

    expect(fixture.episodes.values[0]?.matchedRiskRuleIds).toEqual(['high.harness']);
  });

  it('records a repairable stable failure with diagnostics', async () => {
    const fixture = verificationFixture({ profileResults: [typesFailure()] });

    await expect(fixture.controller.verify('example-task')).rejects.toMatchObject<
      Partial<TaskVerificationError>
    >({ code: 'verify.types', status: 'repairing' });
    expect(fixture.states.state.failures[0]).toMatchObject({
      code: 'verify.types',
      repeatCount: 1,
    });
    expect(fixture.diagnostics.calls).toHaveLength(1);
    expect(fixture.episodes.values[0]).toMatchObject({ finalStatus: 'repairing' });
  });

  it('escalates only after the configured unchanged repair opportunities fail', async () => {
    const fixture = verificationFixture({
      profileResults: [typesFailure(), typesFailure(), typesFailure()],
    });

    await expect(fixture.controller.verify('example-task')).rejects.toMatchObject({
      status: 'repairing',
    });
    await expect(fixture.controller.verify('example-task')).rejects.toMatchObject({
      status: 'repairing',
    });
    await expect(fixture.controller.verify('example-task')).rejects.toMatchObject({
      code: 'verify.types',
      status: 'escalated',
    });

    expect(fixture.states.state.failures.map(({ repeatCount }) => repeatCount)).toEqual([1, 2, 3]);
    expect(fixture.states.state.status).toBe('escalated');
  });

  it('resets the repeated-failure count after meaningful task change', async () => {
    const fixture = verificationFixture({
      preflightFingerprints: ['1'.repeat(64), '2'.repeat(64)],
      profileResults: [typesFailure(), typesFailure()],
    });

    await expect(fixture.controller.verify('example-task')).rejects.toBeInstanceOf(
      TaskVerificationError,
    );
    await expect(fixture.controller.verify('example-task')).rejects.toBeInstanceOf(
      TaskVerificationError,
    );

    expect(fixture.states.state.failures.map(({ repeatCount }) => repeatCount)).toEqual([1, 1]);
  });

  it('escalates an expired task before running a profile', async () => {
    const original = taskState();
    const fixture = verificationFixture({
      state: {
        ...original,
        boundaries: { ...original.boundaries, timeoutMs: 1_000 },
      },
    });

    await expect(fixture.controller.verify('example-task')).rejects.toMatchObject({
      code: 'task.timeout',
      status: 'escalated',
    });
    expect(fixture.profiles.requested).toEqual([]);
    expect(fixture.states.state.status).toBe('escalated');
  });
});

class MemoryStateStore implements TaskStateStore {
  constructor(public state: TaskState) {}

  async create(state: TaskState): Promise<void> {
    this.state = state;
  }

  async read(): Promise<TaskState> {
    return this.state;
  }

  async write(state: TaskState): Promise<void> {
    this.state = state;
  }
}

class FakePreflight implements TaskPreflightService {
  private index = 0;

  constructor(
    private readonly value: TaskPreflightResult,
    private readonly fingerprints: ReadonlyArray<string>,
  ) {}

  async preflight(): Promise<TaskPreflightResult> {
    const fingerprint = this.fingerprints[this.index] ?? this.fingerprints.at(-1);
    this.index += 1;
    return { ...this.value, taskFingerprint: fingerprint ?? this.value.taskFingerprint };
  }
}

class FakeProfiles implements ProfileExecutor {
  readonly requested: string[] = [];

  constructor(
    private readonly results: Array<VerificationProfileRunResult | VerificationStepError>,
  ) {}

  async run(profile: 'fast' | 'full' | 'runtime'): Promise<VerificationProfileRunResult> {
    this.requested.push(profile);
    const result = this.results.shift();
    if (!result) throw new Error('No profile fixture configured.');
    if (result instanceof VerificationStepError) throw result;
    return result;
  }
}

class FakeDiagnostics implements DiagnosticWriter {
  readonly calls: string[] = [];

  async write(_taskId: string, attempt: number, failureCode: string): Promise<DiagnosticReference> {
    this.calls.push(failureCode);
    return {
      path: `.tmp/backendkit/tasks/example-task/diagnostics/attempt-${attempt}.txt`,
      sha256: 'd'.repeat(64),
      truncated: false,
    };
  }
}

class FakeEpisodes implements EpisodeWriter {
  readonly values: TaskEpisode[] = [];

  async write(episode: TaskEpisode): Promise<string> {
    this.values.push(episode);
    return `.tmp/backendkit/tasks/example-task/episodes/attempt-${episode.attempt}.json`;
  }
}

function verificationFixture(
  values: Readonly<{
    preflight?: TaskPreflightResult;
    preflightFingerprints?: ReadonlyArray<string>;
    profileResults?: Array<VerificationProfileRunResult | VerificationStepError>;
    state?: TaskState;
  }> = {},
) {
  const states = new MemoryStateStore(values.state ?? taskState());
  const profiles = new FakeProfiles(values.profileResults ?? [success('full')]);
  const diagnostics = new FakeDiagnostics();
  const episodes = new FakeEpisodes();
  const preflightValue = values.preflight ?? preflight();
  const controller = new TaskVerificationController('/workspace', {
    states,
    taskService: new FakePreflight(
      preflightValue,
      values.preflightFingerprints ?? [preflightValue.taskFingerprint],
    ),
    profiles,
    diagnostics,
    episodes,
    now: () => '2026-08-09T00:01:00.000Z',
  });
  return { controller, states, profiles, diagnostics, episodes };
}

function preflight(
  impactOverrides: Partial<TaskPreflightResult['impacts']> = {},
): TaskPreflightResult {
  return {
    taskId: 'example-task',
    action: 'verify',
    taskPaths: ['tools/backendkit/task/example.ts'],
    preexistingPaths: [],
    controllerArtifactPaths: [],
    classification: {
      effectiveRisk: 'high',
      pathRisk: 'high',
      declaredRisk: 'high',
      paths: ['tools/backendkit/task/example.ts'],
      reasons: [
        {
          path: 'tools/backendkit/task/example.ts',
          risk: 'high',
          ruleId: 'high.harness',
          description: 'Harness implementation or policy',
        },
      ],
    },
    impacts: {
      api: false,
      database: false,
      auth: false,
      queue: false,
      environment: false,
      observability: false,
      externalIntegrations: false,
      harness: true,
      ...impactOverrides,
    },
    taskFingerprint: '1'.repeat(64),
    planPath: 'docs/exec-plans/active/example.md',
    authorityHash: 'a'.repeat(64),
  };
}

function taskState(): TaskState {
  return {
    schemaVersion: 2,
    authoritySchemaVersion: 2,
    taskId: 'example-task',
    status: 'authorized',
    startedAt: '2026-08-09T00:00:00.000Z',
    baseRevision: 'b'.repeat(40),
    planPath: 'docs/exec-plans/active/example.md',
    planSourceHash: 'c'.repeat(64),
    authorityHash: 'a'.repeat(64),
    declaredRisk: 'high',
    boundaries: {
      allowedPaths: ['tools/backendkit/'],
      allowedActions: ['edit', 'verify'],
      maximumRisk: 'high',
      repairLimit: 2,
      timeoutMs: 7_200_000,
    },
    preexistingChanges: [],
    attempt: 0,
    transitions: [
      {
        status: 'authorized',
        occurredAt: '2026-08-09T00:00:00.000Z',
        reason: 'task.begin',
      },
    ],
    failures: [],
  };
}

function success(profile: 'fast' | 'full' | 'runtime'): VerificationProfileRunResult {
  return { profile, durationMs: 10, steps: [] };
}

function typesFailure(): VerificationStepError {
  const step: NpmVerificationStep = {
    kind: 'npm',
    id: 'types',
    title: 'Typecheck',
    script: 'typecheck',
  };
  return new VerificationStepError(step, failedProcess());
}

function failedProcess(): ProcessResult {
  return {
    command: 'npm',
    args: ['run', 'typecheck'],
    code: 1,
    signal: null,
    timedOut: false,
    durationMs: 10,
    stdout: '',
    stderr: 'type error',
  };
}
