import { runBackendkitCli } from './command';
import { assertKnowledgeValid, checkKnowledge } from './knowledge/knowledge-check';
import {
  defaultTaskCommandService,
  writeBeginResult,
  writePreflightResult,
  writeRiskResult,
} from './task/task-command';
import { runVerificationProfile } from './verification/run-profile';

async function main(): Promise<void> {
  const taskService = defaultTaskCommandService();
  process.exitCode = await runBackendkitCli(process.argv.slice(2), {
    runProfile: runVerificationProfile,
    beginTask: async (planPath) =>
      writeBeginResult(process.stdout, await taskService.begin(planPath)),
    preflightTask: async (taskId, action) =>
      writePreflightResult(process.stdout, await taskService.preflight(taskId, action)),
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

void main();
