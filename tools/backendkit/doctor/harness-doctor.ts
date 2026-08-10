import { access, readdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import { readOperatingLedger } from '../evidence/operating-ledger';
import {
  readImprovementLedger,
  validateImprovementProgram,
} from '../improvement/improvement-ledger';
import { assertKnowledgeValid, checkKnowledge } from '../knowledge/knowledge-check';
import { validateHighRiskOracles } from '../oracles/high-risk-oracles';
import { systemProcessRunner, type ProcessRequest, type ProcessRunner } from '../process-runner';
import { FileTaskStateStore } from '../task/task-state';
import { FileTaskWorkspaceStore, TaskWorkspaceService } from '../workspace/task-workspace';

export type DoctorCheck = Readonly<{
  id: string;
  status: 'passed' | 'warning';
  detail: string;
}>;

export type DoctorReport = Readonly<{
  checks: ReadonlyArray<DoctorCheck>;
  taskStates: number;
  workspaces: number;
  staleTasks: number;
  runtimeReady: boolean;
}>;

const activeStatuses = new Set([
  'queued',
  'authorized',
  'preparing',
  'running',
  'verifying',
  'repairing',
  'ready_for_review',
]);

type PolicyValidator = (root: string) => Promise<void>;

export class HarnessDoctor {
  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
    private readonly validatePolicy: PolicyValidator = validateRepositoryPolicy,
  ) {}

  async inspect(): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];
    for (const command of ['git', 'node', 'npm']) {
      await this.requireCommand(command, ['--version']);
      checks.push({ id: `executable.${command}`, status: 'passed', detail: 'available' });
    }

    const repositoryRoot = await this.run({
      command: 'git',
      args: ['rev-parse', '--show-toplevel'],
    });
    if ((await realpath(repositoryRoot.stdout.trim())) !== (await realpath(this.root))) {
      throw new Error('Harness doctor must run from the repository root.');
    }
    checks.push({ id: 'repository.identity', status: 'passed', detail: 'canonical root' });

    const ignored = await this.run({
      command: 'git',
      args: ['check-ignore', '--quiet', '--no-index', '.tmp/backendkit/doctor-probe'],
    });
    if (ignored.code !== 0) throw new Error('Harness private state root must be Git-ignored.');
    checks.push({ id: 'repository.private-state', status: 'passed', detail: 'ignored' });

    await this.validatePolicy(this.root);
    checks.push({ id: 'policy.schemas', status: 'passed', detail: 'valid' });

    const taskIds = await taskDirectories(this.root);
    const states = new FileTaskStateStore(this.root);
    const workspaces = new FileTaskWorkspaceStore(this.root);
    const workspaceService = new TaskWorkspaceService(this.root, { states, workspaces });
    let workspaceCount = 0;
    let staleTasks = 0;
    for (const taskId of taskIds) {
      const state = await states.read(taskId);
      if (activeStatuses.has(state.status) && !(await exists(resolve(this.root, state.planPath)))) {
        staleTasks += 1;
      }
      try {
        await workspaces.read(taskId);
        await workspaceService.status(taskId);
        workspaceCount += 1;
      } catch (error: unknown) {
        if (!(error instanceof Error) || !error.message.includes('does not exist')) throw error;
      }
    }
    checks.push({
      id: 'state.schemas',
      status: 'passed',
      detail: `${taskIds.length} task states; ${workspaceCount} workspaces`,
    });
    checks.push({
      id: 'state.lifecycle',
      status: staleTasks === 0 ? 'passed' : 'warning',
      detail:
        staleTasks === 0
          ? 'no orphaned active task state'
          : `${staleTasks} local task states reference plans no longer active`,
    });

    const runtimeReady = await this.dockerReady();
    checks.push({
      id: 'runtime.docker',
      status: runtimeReady ? 'passed' : 'warning',
      detail: runtimeReady ? 'ready' : 'unavailable; runtime profile cannot run',
    });

    return {
      checks,
      taskStates: taskIds.length,
      workspaces: workspaceCount,
      staleTasks,
      runtimeReady,
    };
  }

  private async requireCommand(command: string, args: ReadonlyArray<string>): Promise<void> {
    await this.run({ command, args });
  }

  private async run(request: Readonly<{ command: string; args: ReadonlyArray<string> }>) {
    const processRequest: ProcessRequest = {
      command: request.command,
      args: request.args,
      cwd: this.root,
      stdio: 'pipe',
      timeoutMs: 15_000,
    };
    const result = await this.runner.run(processRequest);
    if (result.code !== 0 || result.signal || result.timedOut) {
      throw new Error(`Harness prerequisite '${request.command}' is unavailable or unhealthy.`);
    }
    return result;
  }

  private async dockerReady(): Promise<boolean> {
    try {
      const result = await this.runner.run({
        command: 'docker',
        args: ['info'],
        cwd: this.root,
        stdio: 'pipe',
        timeoutMs: 15_000,
      });
      return result.code === 0 && !result.signal && !result.timedOut;
    } catch {
      return false;
    }
  }
}

async function validateRepositoryPolicy(root: string): Promise<void> {
  const knowledge = await checkKnowledge(root);
  assertKnowledgeValid(knowledge);
  await validateHighRiskOracles(root);
  const evidence = await readOperatingLedger(root);
  const improvements = await readImprovementLedger(root);
  await validateImprovementProgram(root, evidence, improvements);
}

async function taskDirectories(root: string): Promise<ReadonlyArray<string>> {
  try {
    const entries = await readdir(resolve(root, '.tmp', 'backendkit', 'tasks'), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]{2,79}$/.test(entry.name))
      .map(({ name }) => name)
      .sort();
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
}
