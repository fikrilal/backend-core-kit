import { runBackendkitCli } from './command';
import { DiagnosticStore } from './evidence/diagnostics';
import { EpisodeStore } from './evidence/episode';
import { EventIntakeService, type EventIntakeResult } from './events/event-intake';
import { assertKnowledgeValid, checkKnowledge } from './knowledge/knowledge-check';
import { MaintenanceService, type MaintenanceResult } from './maintenance/maintenance-service';
import {
  defaultTaskCommandService,
  writeBeginResult,
  writePreflightResult,
  writeRiskResult,
} from './task/task-command';
import { SystemGitRepository } from './task/git-repository';
import { TaskService } from './task/task-service';
import { FileTaskStateStore } from './task/task-state';
import { TaskVerificationController } from './task/task-verification';
import {
  defaultVerificationRunOptions,
  runVerificationProfile,
  type TextOutput,
} from './verification/run-profile';
import { TaskWorkspaceService, type TaskWorkspaceResult } from './workspace/task-workspace';

async function main(): Promise<void> {
  const root = process.cwd();
  const taskService = defaultTaskCommandService();
  const states = new FileTaskStateStore(root);
  const workspaces = new TaskWorkspaceService(root, { states });
  const events = new EventIntakeService(root, { states });
  const maintenance = new MaintenanceService(root);
  process.exitCode = await runBackendkitCli(process.argv.slice(2), {
    runProfile: async (profile) => {
      await runVerificationProfile(profile);
    },
    beginTask: async (planPath) =>
      writeBeginResult(process.stdout, await taskService.begin(planPath)),
    preflightTask: async (taskId, action) => {
      const candidateRoot = await workspaces.resolveCandidateRoot(taskId);
      const service = candidateRoot
        ? new TaskService(candidateRoot, new SystemGitRepository(candidateRoot), states)
        : taskService;
      writePreflightResult(process.stdout, await service.preflight(taskId, action));
    },
    verifyTask: async (taskId) => {
      const candidateRoot = await workspaces.resolveCandidateRoot(taskId);
      const result = await verificationController(root, candidateRoot, states).verify(taskId);
      process.stdout.write(
        `Task verification passed: ${result.taskId}; attempt ${result.attempt}; ${result.lanes.map(({ id }) => id).join(', ')}; episode ${result.episodePath}.\n`,
      );
    },
    manageTaskWorkspace: async (operation, taskId) => {
      const result =
        operation === 'prepare'
          ? await workspaces.prepare(taskId)
          : operation === 'status'
            ? await workspaces.status(taskId)
            : operation === 'cancel'
              ? await workspaces.cancel(taskId)
              : await workspaces.cleanup(taskId);
      writeWorkspaceResult(process.stdout, operation, result);
    },
    runEventsOnce: async () => writeEventResult(process.stdout, await events.runOnce()),
    runMaintenanceOnce: async () =>
      writeMaintenanceResult(process.stdout, await maintenance.runOnce()),
    classifyRisk: async (planPath) =>
      writeRiskResult(process.stdout, await taskService.classifyCurrent(planPath)),
    checkKnowledge: async () => {
      const report = await checkKnowledge(process.cwd());
      assertKnowledgeValid(report);
      process.stdout.write(
        `Knowledge check passed: ${report.checkedPlans} plans; ${report.v2Plans} V2; ${report.legacyCompletedPlans} legacy completed.\n`,
      );
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

function writeEventResult(output: TextOutput, result: EventIntakeResult): void {
  if (result.kind === 'idle') {
    output.write(`Event intake idle: ${result.reason}.\n`);
    return;
  }
  output.write(
    `Event accepted: ${result.eventId}; task ${result.task.taskId}; plan ${result.activePlanPath};${result.recovered ? ' recovered;' : ''} current agent may prepare the workspace.\n`,
  );
}

function writeMaintenanceResult(output: TextOutput, result: MaintenanceResult): void {
  output.write(
    `Maintenance completed: ${result.steps.map(({ id, durationMs }) => `${id} ${durationMs}ms`).join('; ')}.\n`,
  );
}

function verificationController(
  root: string,
  candidateRoot: string | undefined,
  states: FileTaskStateStore,
): TaskVerificationController {
  if (!candidateRoot) return new TaskVerificationController(root, { states });
  return new TaskVerificationController(candidateRoot, {
    taskService: new TaskService(candidateRoot, new SystemGitRepository(candidateRoot), states),
    states,
    diagnostics: new DiagnosticStore(root),
    episodes: new EpisodeStore(root),
    profiles: {
      run: async (profile) =>
        await runVerificationProfile(profile, {
          ...defaultVerificationRunOptions(),
          cwd: candidateRoot,
          stdio: 'pipe',
        }),
    },
  });
}

function writeWorkspaceResult(
  output: TextOutput,
  operation: string,
  result: TaskWorkspaceResult,
): void {
  output.write(
    `Task workspace ${operation}: ${result.taskId}; ${result.status}; ${result.branch}; ${result.path}.\n`,
  );
}

void main();
