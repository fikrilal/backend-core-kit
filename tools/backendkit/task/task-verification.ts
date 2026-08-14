import { createHash } from 'node:crypto';

import { DiagnosticStore, type DiagnosticReference } from '../evidence/diagnostics';
import { EpisodeStore, type LaneOutcome, type TaskEpisode } from '../evidence/episode';
import { describeVerificationFailure } from '../verification/failure-taxonomy';
import { selectVerificationLanes, type VerificationLaneId } from '../verification/lane-selection';
import {
  defaultVerificationRunOptions,
  runVerificationProfile,
  VerificationStepError,
  type TextOutput,
  type VerificationProfileRunResult,
} from '../verification/run-profile';
import { TaskService, type TaskPreflightResult } from './task-service';
import {
  FileTaskStateStore,
  transitionTask,
  type TaskFailureRecord,
  type TaskLifecycleStatus,
  type TaskState,
  type TaskStateStore,
} from './task-state';

export interface ProfileExecutor {
  run(profile: VerificationLaneId): Promise<VerificationProfileRunResult>;
}

export interface TaskPreflightService {
  preflight(taskId: string, action: 'verify'): Promise<TaskPreflightResult>;
}

export interface DiagnosticWriter {
  write(
    taskId: string,
    attempt: number,
    failureCode: string,
    result: VerificationStepError['result'],
  ): Promise<DiagnosticReference>;
}

export interface EpisodeWriter {
  write(episode: TaskEpisode): Promise<string>;
}

export type TaskVerificationResult = Readonly<{
  taskId: string;
  attempt: number;
  status: 'ready_for_review';
  lanes: ReadonlyArray<LaneOutcome>;
  episodePath: string;
  reviewRequired: boolean;
}>;

export class TaskVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly status: TaskLifecycleStatus,
    readonly remediation: string,
    readonly episodePath?: string,
    readonly diagnosticPath?: string,
  ) {
    super(`${code}: verification stopped in ${status}. ${remediation}`);
    this.name = 'TaskVerificationError';
  }
}

export class TaskVerificationController {
  private readonly taskService: TaskPreflightService;
  private readonly states: TaskStateStore;
  private readonly diagnostics: DiagnosticWriter;
  private readonly episodes: EpisodeWriter;
  private readonly profiles: ProfileExecutor;

  constructor(
    private readonly root: string,
    options: Readonly<{
      taskService?: TaskPreflightService;
      states?: TaskStateStore;
      diagnostics?: DiagnosticWriter;
      episodes?: EpisodeWriter;
      profiles?: ProfileExecutor;
      output?: TextOutput;
      now?: () => string;
    }> = {},
  ) {
    this.taskService = options.taskService ?? new TaskService(root);
    this.states = options.states ?? new FileTaskStateStore(root);
    this.diagnostics = options.diagnostics ?? new DiagnosticStore(root);
    this.episodes = options.episodes ?? new EpisodeStore(root);
    const output = options.output ?? process.stdout;
    this.profiles =
      options.profiles ??
      ({
        run: async (profile) =>
          await runVerificationProfile(profile, {
            ...defaultVerificationRunOptions(),
            cwd: root,
            output,
            stdio: 'pipe',
          }),
      } satisfies ProfileExecutor);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readonly now: () => string;

  async verify(taskId: string): Promise<TaskVerificationResult> {
    let state = await this.states.read(taskId);
    this.assertVerifiable(state);
    if (Date.parse(this.now()) - Date.parse(state.startedAt) > state.boundaries.timeoutMs) {
      state = transitionTask(state, 'escalated', this.now(), 'task.timeout');
      await this.states.write(state);
      throw new TaskVerificationError(
        'task.timeout',
        'escalated',
        'Create a newly authorized task after reviewing the timed-out work.',
      );
    }

    const preflight = await this.taskService.preflight(taskId, 'verify');
    const selection = selectVerificationLanes(preflight.classification, preflight.impacts);
    const attempt = state.attempt + 1;
    state = transitionTask(
      {
        ...state,
        schemaVersion: 2,
        authoritySchemaVersion: 2,
        authorityHash: preflight.authorityHash,
        attempt,
      },
      'verifying',
      this.now(),
      'task.verify.started',
    );
    await this.states.write(state);

    const lanes: LaneOutcome[] = [];
    for (const lane of selection.lanes) {
      const startedAt = Date.now();
      try {
        const result = await this.profiles.run(lane);
        lanes.push({ id: lane, status: 'passed', durationMs: result.durationMs });
      } catch (error: unknown) {
        if (!(error instanceof VerificationStepError)) {
          state = transitionTask(state, 'failed', this.now(), 'harness.profile-execution');
          await this.states.write(state);
          const failedLane: LaneOutcome = {
            id: lane,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            failureCode: 'harness.profile-execution',
          };
          const episodePath = await this.episodes.write(
            this.episode({
              state,
              preflight,
              runtimeReasons: selection.runtimeReasons,
              lanes: [...lanes, failedLane],
              taskFingerprint: preflight.taskFingerprint,
              stopReason: 'harness.profile-execution',
            }),
          );
          throw new TaskVerificationError(
            'harness.profile-execution',
            'failed',
            'Escalate the unclassified harness execution failure.',
            episodePath,
          );
        }
        return await this.recordFailure({
          state,
          preflight,
          selection,
          lanes,
          lane,
          laneDurationMs: Date.now() - startedAt,
          error,
        });
      }
    }

    state = transitionTask(state, 'ready_for_review', this.now(), 'task.verify.passed');
    await this.states.write(state);
    const episodePath = await this.episodes.write(
      this.episode({
        state,
        preflight,
        runtimeReasons: selection.runtimeReasons,
        lanes,
        taskFingerprint: preflight.taskFingerprint,
        stopReason: 'verification.passed',
      }),
    );
    return {
      taskId,
      attempt,
      status: 'ready_for_review',
      lanes,
      episodePath,
      reviewRequired: preflight.classification.effectiveRisk === 'high',
    };
  }

  private async recordFailure(
    input: Readonly<{
      state: TaskState;
      preflight: TaskPreflightResult;
      selection: ReturnType<typeof selectVerificationLanes>;
      lanes: ReadonlyArray<LaneOutcome>;
      lane: VerificationLaneId;
      laneDurationMs: number;
      error: VerificationStepError;
    }>,
  ): Promise<never> {
    const descriptor = describeVerificationFailure(input.lane, input.error.step);
    const failureFingerprint = hash(`${input.preflight.taskFingerprint}:${descriptor.code}`);
    const previous = [...input.state.failures]
      .reverse()
      .find(
        (candidate) =>
          candidate.code === descriptor.code && candidate.taskFingerprint === failureFingerprint,
      );
    const repeatCount = previous ? previous.repeatCount + 1 : 1;
    const failure: TaskFailureRecord = {
      attempt: input.state.attempt,
      occurredAt: this.now(),
      code: descriptor.code,
      taskFingerprint: failureFingerprint,
      repeatCount,
    };
    const exhausted = repeatCount > input.state.boundaries.repairLimit;
    const status: TaskLifecycleStatus =
      !descriptor.repairable || exhausted ? 'escalated' : 'repairing';
    const diagnostic = await this.diagnostics.write(
      input.state.taskId,
      input.state.attempt,
      descriptor.code,
      input.error.result,
    );
    const failedLane: LaneOutcome = {
      id: input.lane,
      status: 'failed',
      durationMs: input.laneDurationMs,
      failureCode: descriptor.code,
    };
    const state = transitionTask(
      { ...input.state, failures: [...input.state.failures, failure] },
      status,
      this.now(),
      exhausted ? 'repair.exhausted' : descriptor.code,
    );
    await this.states.write(state);
    const episodePath = await this.episodes.write(
      this.episode({
        state,
        preflight: input.preflight,
        runtimeReasons: input.selection.runtimeReasons,
        lanes: [...input.lanes, failedLane],
        taskFingerprint: failureFingerprint,
        stopReason: exhausted ? 'repair.exhausted' : descriptor.code,
        diagnostic,
      }),
    );
    throw new TaskVerificationError(
      descriptor.code,
      status,
      exhausted ? 'Repair budget exhausted; request human direction.' : descriptor.remediation,
      episodePath,
      diagnostic.path,
    );
  }

  private episode(
    input: Readonly<{
      state: TaskState;
      preflight: TaskPreflightResult;
      runtimeReasons: ReadonlyArray<string>;
      lanes: ReadonlyArray<LaneOutcome>;
      taskFingerprint: string;
      stopReason: string;
      diagnostic?: DiagnosticReference;
    }>,
  ): TaskEpisode {
    return {
      schemaVersion: 1,
      taskId: input.state.taskId,
      attempt: input.state.attempt,
      generatedAt: this.now(),
      planPath: input.preflight.planPath,
      authorityHash: input.preflight.authorityHash,
      baseRevision: input.state.baseRevision,
      taskFingerprint: input.taskFingerprint,
      effectiveRisk: input.preflight.classification.effectiveRisk,
      reviewRequired: input.preflight.classification.effectiveRisk === 'high',
      matchedRiskRuleIds: input.preflight.classification.reasons.map(({ ruleId }) => ruleId),
      changedPaths: input.preflight.taskPaths,
      runtimeReasons: input.runtimeReasons,
      lanes: input.lanes,
      transitions: input.state.transitions,
      finalStatus: input.state.status,
      stopReason: input.stopReason,
      diagnostic: input.diagnostic,
    };
  }

  private assertVerifiable(state: TaskState): void {
    if (state.status !== 'authorized' && state.status !== 'repairing') {
      throw new TaskVerificationError(
        'task.state-not-verifiable',
        state.status,
        'Only authorized or repairing tasks may start verification.',
      );
    }
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
