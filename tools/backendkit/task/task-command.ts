import type { RiskClassification } from '../policy/risk-classifier';
import type { TextOutput } from '../verification/run-profile';
import { TaskService, type TaskBeginResult, type TaskPreflightResult } from './task-service';
import type { TaskAction } from './task-plan';

export interface TaskCommandService {
  begin(planPath: string): Promise<TaskBeginResult>;
  preflight(taskId: string, action: TaskAction): Promise<TaskPreflightResult>;
  classifyCurrent(planPath?: string): Promise<RiskClassification>;
}

export function defaultTaskCommandService(): TaskCommandService {
  return new TaskService(process.cwd());
}

export function writeBeginResult(output: TextOutput, result: TaskBeginResult): void {
  output.write(
    `Task baseline created: ${result.taskId}; ${result.preexistingPathCount} pre-existing path(s); ${result.declaredRisk} declared risk.\n`,
  );
}

export function writePreflightResult(output: TextOutput, result: TaskPreflightResult): void {
  output.write(
    `Task preflight passed: ${result.taskId}; ${result.action}; ${result.classification.effectiveRisk} effective risk; ${result.taskPaths.length} task-owned path(s); ${result.controllerArtifactPaths.length} controller artifact(s).\n`,
  );
}

export function writeRiskResult(output: TextOutput, result: RiskClassification): void {
  output.write(
    `Effective risk: ${result.effectiveRisk} (path: ${result.pathRisk}, declared: ${result.declaredRisk ?? 'none'})\n`,
  );
  for (const reason of result.reasons) {
    output.write(`- ${reason.path}: ${reason.ruleId} (${reason.description})\n`);
  }
}
