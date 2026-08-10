import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { classifyRisk, type RiskClassification } from '../policy/risk-classifier';
import type { ProcessRunner } from '../process-runner';
import { systemProcessRunner } from '../process-runner';
import { maximumRisk, parseTaskPlan, type TaskImpactAreas, type TaskPlan } from '../task/task-plan';
import { selectVerificationLanes } from '../verification/lane-selection';

export type CiClassification = Readonly<{
  classification: RiskClassification;
  runtimeRequired: boolean;
  runtimeReasons: ReadonlyArray<string>;
  changedPaths: ReadonlyArray<string>;
  planPaths: ReadonlyArray<string>;
}>;

export interface CiDiffReader {
  changedPaths(base: string, head: string): Promise<ReadonlyArray<string>>;
}

export interface CiPlanReader {
  read(path: string): Promise<string | undefined>;
}

export class SystemCiDiffReader implements CiDiffReader {
  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
  ) {}

  async changedPaths(base: string, head: string): Promise<ReadonlyArray<string>> {
    assertRevision(base, 'base');
    assertRevision(head, 'head');
    const result = await this.runner.run({
      command: 'git',
      args: ['diff', '--name-only', '--diff-filter=ACMRDT', '-z', `${base}...${head}`, '--'],
      cwd: this.root,
      stdio: 'pipe',
      timeoutMs: 30_000,
    });
    if (result.code !== 0 || result.signal || result.timedOut) {
      throw new Error('Could not classify the clean base/head Git diff.');
    }
    return [...new Set(result.stdout.split('\0').filter((path) => path.length > 0))].sort();
  }
}

export class FileCiPlanReader implements CiPlanReader {
  constructor(private readonly root: string) {}

  async read(path: string): Promise<string | undefined> {
    try {
      const source = await readFile(resolve(this.root, path));
      if (source.byteLength > 64 * 1024)
        throw new Error(`Changed execution plan is too large: ${path}.`);
      return source.toString('utf8');
    } catch (error: unknown) {
      if (isCode(error, 'ENOENT')) return undefined;
      throw error;
    }
  }
}

export class CiClassificationService {
  private readonly diffs: CiDiffReader;
  private readonly plans: CiPlanReader;

  constructor(
    root: string,
    options: Readonly<{ diffs?: CiDiffReader; plans?: CiPlanReader }> = {},
  ) {
    this.diffs = options.diffs ?? new SystemCiDiffReader(root);
    this.plans = options.plans ?? new FileCiPlanReader(root);
  }

  async classify(base: string, head: string): Promise<CiClassification> {
    const changedPaths = await this.diffs.changedPaths(base, head);
    const planPaths = changedPaths.filter(isExecutionPlanPath);
    const plans = await this.changedPlans(planPaths);
    const declaredRisk = plans.length > 0 ? maximumRisk(plans.map(({ risk }) => risk)) : undefined;
    const classification = classifyRisk(changedPaths, declaredRisk);
    const laneSelection = selectVerificationLanes(classification, combineImpacts(plans));
    return {
      classification,
      runtimeRequired: laneSelection.lanes.includes('runtime'),
      runtimeReasons: laneSelection.runtimeReasons,
      changedPaths,
      planPaths: plans.map(({ path }) => path).sort(),
    };
  }

  private async changedPlans(paths: ReadonlyArray<string>): Promise<ReadonlyArray<TaskPlan>> {
    const plans: TaskPlan[] = [];
    for (const path of paths) {
      const source = await this.plans.read(path);
      if (!source || !/^\*\*Plan version:\*\*/m.test(source)) continue;
      plans.push(parseTaskPlan(path, source));
    }
    return plans;
  }
}

export function writeCiClassification(
  output: { write(value: string): void },
  result: CiClassification,
): void {
  output.write(`effective_risk=${result.classification.effectiveRisk}\n`);
  output.write(`runtime_required=${String(result.runtimeRequired)}\n`);
}

function combineImpacts(plans: ReadonlyArray<TaskPlan>): TaskImpactAreas {
  return {
    api: plans.some(({ impacts }) => impacts.api),
    database: plans.some(({ impacts }) => impacts.database),
    auth: plans.some(({ impacts }) => impacts.auth),
    queue: plans.some(({ impacts }) => impacts.queue),
    environment: plans.some(({ impacts }) => impacts.environment),
    observability: plans.some(({ impacts }) => impacts.observability),
    externalIntegrations: plans.some(({ impacts }) => impacts.externalIntegrations),
    harness: plans.some(({ impacts }) => impacts.harness),
  };
}

function isExecutionPlanPath(path: string): boolean {
  return /^docs\/exec-plans\/(?:active|queued|completed)\/[^/]+\.md$/.test(path);
}

function assertRevision(value: string, label: string): void {
  if (!/^[0-9a-f]{40,64}$/.test(value) || /^0+$/.test(value)) {
    throw new Error(`CI ${label} revision is invalid.`);
  }
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
