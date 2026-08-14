import {
  parseVerificationProfileId,
  type VerificationProfileId,
} from './verification/profile-registry';
import type { TextOutput } from './verification/run-profile';

export type BackendkitCommand =
  Readonly<{ kind: 'help' }> | Readonly<{ kind: 'verify'; profile: VerificationProfileId }>;

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export type BackendkitCliDependencies = Readonly<{
  runProfile(profile: VerificationProfileId): Promise<void>;
  stdout: TextOutput;
  stderr: TextOutput;
}>;

export function parseBackendkitCommand(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { kind: 'help' };
  }

  if (args[0] !== 'verify') {
    throw new CliUsageError(`Unknown command '${args[0]}'`);
  }

  if (args.length === 1) return { kind: 'verify', profile: 'fast' };

  if (args.length !== 3 || args[1] !== '--profile') {
    throw new CliUsageError('Usage: backendkit verify [--profile fast|full|runtime|ci]');
  }

  const profile = parseVerificationProfileId(args[2]);
  if (!profile) {
    throw new CliUsageError(`Unknown verification profile '${args[2]}'`);
  }

  return { kind: 'verify', profile };
}

export function backendkitHelp(): string {
  return [
    'backendkit — repository-local backend harness',
    '',
    'Usage:',
    '  backendkit verify [--profile fast|full|runtime|ci]',
    '  backendkit --help',
    '',
    'Profiles:',
    '  fast     deterministic static checks and unit tests',
    '  full     complete non-Docker CI-equivalent verification',
    '  runtime  Docker-backed migration, integration, and E2E verification',
    '  ci       full followed by runtime',
    '',
  ].join('\n');
}

export async function runBackendkitCli(
  args: ReadonlyArray<string>,
  dependencies: BackendkitCliDependencies,
): Promise<number> {
  try {
    const command = parseBackendkitCommand(args);
    if (command.kind === 'help') {
      dependencies.stdout.write(backendkitHelp());
      return 0;
    }

    await dependencies.runProfile(command.profile);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.stderr.write(`backendkit: ${message}\n`);
    if (error instanceof CliUsageError) {
      dependencies.stderr.write('Run backendkit --help for usage.\n');
      return 2;
    }
    return 1;
  }
}
