import { npmInvocation, systemProcessRunner } from '../process-runner';
import type { ProcessResult, ProcessRunner } from '../process-runner';
import {
  expandVerificationProfile,
  verificationProfiles,
  type NpmVerificationStep,
  type VerificationProfileId,
} from './profile-registry';

export interface TextOutput {
  write(message: string): void;
}

export type VerificationRunOptions = Readonly<{
  cwd: string;
  env: NodeJS.ProcessEnv;
  processRunner: ProcessRunner;
  output: TextOutput;
}>;

export class VerificationStepError extends Error {
  constructor(
    readonly step: NpmVerificationStep,
    readonly result: ProcessResult,
  ) {
    super(failureMessage(step, result));
    this.name = 'VerificationStepError';
  }
}

function failureMessage(step: NpmVerificationStep, result: ProcessResult): string {
  if (result.timedOut) return `${step.title} timed out`;
  if (result.signal) return `${step.title} exited with signal ${result.signal}`;
  return `${step.title} exited with code ${String(result.code)}`;
}

export function defaultVerificationRunOptions(): VerificationRunOptions {
  return {
    cwd: process.cwd(),
    env: process.env,
    processRunner: systemProcessRunner,
    output: process.stdout,
  };
}

export async function runVerificationProfile(
  profileId: VerificationProfileId,
  options: VerificationRunOptions = defaultVerificationRunOptions(),
): Promise<void> {
  const profile = verificationProfiles[profileId];
  const steps = expandVerificationProfile(profileId);

  options.output.write(`backendkit verify: ${profile.id} — ${profile.description}\n`);

  for (const step of steps) {
    options.output.write(`\n==> ${step.title}\n`);
    const invocation = npmInvocation(['run', step.script]);
    const result = await options.processRunner.run({
      ...invocation,
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
      timeoutMs: step.timeoutMs,
    });

    if (result.code !== 0 || result.signal !== null || result.timedOut) {
      throw new VerificationStepError(step, result);
    }

    options.output.write(
      `==> ${step.title} completed in ${(result.durationMs / 1000).toFixed(1)}s\n`,
    );
  }

  options.output.write(`\nbackendkit verify: ${profile.id} completed successfully\n`);
}
