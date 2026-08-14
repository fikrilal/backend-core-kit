import { runBackendkitCli } from './command';
import { CiClassificationService, writeCiClassification } from './ci/ci-classification';
import { DiagnosticStore } from './evidence/diagnostics';
import { HarnessDoctor } from './doctor/harness-doctor';
import { EpisodeStore } from './evidence/episode';
import { evidenceEligibility, readOperatingLedger } from './evidence/operating-ledger';
import { EventIntakeService, type EventIntakeResult } from './events/event-intake';
import {
  HandoffService,
  type HandoffDryRunResult,
  type HandoffMutationResult,
} from './handoff/handoff-service';
import { assertKnowledgeValid, checkKnowledge } from './knowledge/knowledge-check';
import { MaintenanceService, type MaintenanceResult } from './maintenance/maintenance-service';
import {
  evaluateShadow,
  readImprovementLedger,
  validateImprovementProgram,
} from './improvement/improvement-ledger';
import { analyzeEvidenceTrends } from './improvement/trend-analysis';
import { highRiskOracles, validateHighRiskOracles } from './oracles/high-risk-oracles';
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
  const ci = new CiClassificationService(root);
  const handoff = new HandoffService(root, { states });
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
    classifyCi: async (base, head) =>
      writeCiClassification(process.stdout, await ci.classify(base, head)),
    dryRunHandoff: async (taskId, action) =>
      writeHandoffDryRun(process.stdout, await handoff.dryRun(taskId, action)),
    commitHandoff: async (taskId, message) =>
      writeHandoffMutation(
        process.stdout,
        await handoff.commit(taskId, requiredHandoffApproval(), message),
      ),
    pushHandoff: async (taskId) =>
      writeHandoffMutation(process.stdout, await handoff.push(taskId, requiredHandoffApproval())),
    draftPrHandoff: async (taskId, base, title) =>
      writeHandoffMutation(
        process.stdout,
        await handoff.draftPr(taskId, requiredHandoffApproval(), base, title),
      ),
    checkOracles: async () => {
      await validateHighRiskOracles(root);
      process.stdout.write(`High-risk oracle check passed: ${highRiskOracles.length} scenarios.\n`);
    },
    checkEvidence: async () => {
      const eligibility = evidenceEligibility(await readOperatingLedger(root));
      process.stdout.write(
        `Operating evidence: ${eligibility.reviewedTasks} reviewed tasks; ${eligibility.riskClasses} risk classes; ${eligibility.repairsOrEscalations} repairs/escalations; hill climbing ${eligibility.eligible ? 'eligible' : `ineligible (${eligibility.missing.join(', ')})`}.\n`,
      );
    },
    checkImprovements: async () => {
      const evidence = await readOperatingLedger(root);
      const improvements = await readImprovementLedger(root);
      await validateImprovementProgram(root, evidence, improvements);
      process.stdout.write(
        `Harness improvement check passed: ${improvements.hypotheses.length} hypotheses; ${evidenceEligibility(evidence).eligible ? 'enabled' : 'disabled by evidence threshold'}.\n`,
      );
    },
    analyzeImprovements: async () => {
      const evidence = await readOperatingLedger(root);
      const improvements = await readImprovementLedger(root);
      await validateImprovementProgram(root, evidence, improvements);
      const trend = analyzeEvidenceTrends(evidence);
      process.stdout.write(
        `Harness trends: ${trend.reviewedTasks} tasks; ${trend.riskClasses} risk classes; repair/escalation ${trend.repairOrEscalationRateBps}bps; terminal escalation ${trend.escalationRateBps}bps; hill climbing ${trend.eligible ? 'enabled' : 'disabled'}.\n`,
      );
      for (const reason of trend.recurringStopReasons) {
        process.stdout.write(`- ${reason.id}: ${reason.count}\n`);
      }
    },
    shadowImprovement: async (hypothesisId) => {
      const evidence = await readOperatingLedger(root);
      const improvements = await readImprovementLedger(root);
      await validateImprovementProgram(root, evidence, improvements);
      if (!evidenceEligibility(evidence).eligible) {
        process.stdout.write('Harness shadow evaluation disabled by evidence threshold.\n');
        return;
      }
      const hypothesis = improvements.hypotheses.find(({ id }) => id === hypothesisId);
      if (!hypothesis)
        throw new Error(`Harness improvement hypothesis '${hypothesisId}' not found.`);
      const result = evaluateShadow(evidence, hypothesis);
      process.stdout.write(`Harness shadow evaluation: ${hypothesisId}; ${result.status}.\n`);
    },
    classifyRisk: async (planPath) =>
      writeRiskResult(process.stdout, await taskService.classifyCurrent(planPath)),
    checkKnowledge: async () => {
      const report = await checkKnowledge(process.cwd());
      assertKnowledgeValid(report);
      process.stdout.write(
        `Knowledge check passed: ${report.checkedPlans} plans; ${report.v2Plans} V2; ${report.legacyCompletedPlans} legacy completed.\n`,
      );
    },
    runDoctor: async () => {
      const report = await new HarnessDoctor(root).inspect();
      process.stdout.write(
        `Harness doctor passed: ${report.checks.length} checks; ${report.taskStates} task states; ${report.workspaces} workspaces; ${report.staleTasks} stale tasks; runtime ${report.runtimeReady ? 'ready' : 'unavailable'}.\n`,
      );
      for (const check of report.checks) {
        process.stdout.write(`- ${check.id}: ${check.status} (${check.detail})\n`);
      }
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

function writeHandoffDryRun(output: TextOutput, result: HandoffDryRunResult): void {
  output.write(
    `Handoff dry-run: ${result.taskId}; ${result.action}; attempt ${result.attempt}; ${result.branch}; ${result.remote}; expires ${result.expiresAt}.\n`,
  );
  for (const path of result.changedPaths) output.write(`- ${path}\n`);
  output.write(`Approval: ${result.approval}\n`);
}

function writeHandoffMutation(output: TextOutput, result: HandoffMutationResult): void {
  output.write(`Handoff completed: ${result.taskId}; ${result.action}; ${result.outcome}.\n`);
}

function requiredHandoffApproval(): string {
  const approval = process.env.BACKENDKIT_HANDOFF_APPROVAL;
  if (!approval) {
    throw new Error(
      'BACKENDKIT_HANDOFF_APPROVAL is required after explicit user approval of a fresh dry-run.',
    );
  }
  return approval;
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
