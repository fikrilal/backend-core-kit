import { parseTaskAction, type TaskAction } from './task/task-plan';
import {
  parseVerificationProfileId,
  type VerificationProfileId,
} from './verification/profile-registry';
import type { TextOutput } from './verification/run-profile';

export type BackendkitCommand =
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'verify'; profile: VerificationProfileId }>
  | Readonly<{ kind: 'task-begin'; planPath: string }>
  | Readonly<{ kind: 'task-preflight'; taskId: string; action: TaskAction }>
  | Readonly<{ kind: 'task-verify'; taskId: string }>
  | Readonly<{
      kind: 'task-workspace';
      operation: 'prepare' | 'status' | 'cancel' | 'cleanup';
      taskId: string;
    }>
  | Readonly<{ kind: 'events-run-once' }>
  | Readonly<{ kind: 'maintenance-run-once' }>
  | Readonly<{ kind: 'risk-classify'; planPath?: string }>
  | Readonly<{ kind: 'knowledge-check' }>;

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export type BackendkitCliDependencies = Readonly<{
  runProfile(profile: VerificationProfileId): Promise<void>;
  beginTask(planPath: string): Promise<void>;
  preflightTask(taskId: string, action: TaskAction): Promise<void>;
  verifyTask(taskId: string): Promise<void>;
  manageTaskWorkspace(
    operation: 'prepare' | 'status' | 'cancel' | 'cleanup',
    taskId: string,
  ): Promise<void>;
  runEventsOnce(): Promise<void>;
  runMaintenanceOnce(): Promise<void>;
  classifyRisk(planPath?: string): Promise<void>;
  checkKnowledge(): Promise<void>;
  stdout: TextOutput;
  stderr: TextOutput;
}>;

export function parseBackendkitCommand(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return { kind: 'help' };
  switch (args[0]) {
    case 'verify':
      return parseVerify(args);
    case 'task':
      return parseTask(args);
    case 'events':
      return parseEvents(args);
    case 'maintenance':
      return parseMaintenance(args);
    case 'risk':
      return parseRisk(args);
    case 'knowledge':
      return parseKnowledge(args);
    default:
      throw new CliUsageError(`Unknown command '${args[0]}'`);
  }
}

export function backendkitHelp(): string {
  return [
    'backendkit — repository-local backend harness',
    '',
    'Usage:',
    '  backendkit verify [--profile fast|full|runtime|ci]',
    '  backendkit task begin --plan <path>',
    '  backendkit task preflight --task <id> [--action edit|verify|...]',
    '  backendkit task verify --task <id>',
    '  backendkit task workspace prepare|status|cancel|cleanup --task <id>',
    '  backendkit events run --once',
    '  backendkit maintenance run --once',
    '  backendkit risk classify [--plan <path>]',
    '  backendkit knowledge check',
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
    switch (command.kind) {
      case 'help':
        dependencies.stdout.write(backendkitHelp());
        break;
      case 'verify':
        await dependencies.runProfile(command.profile);
        break;
      case 'task-begin':
        await dependencies.beginTask(command.planPath);
        break;
      case 'task-preflight':
        await dependencies.preflightTask(command.taskId, command.action);
        break;
      case 'task-verify':
        await dependencies.verifyTask(command.taskId);
        break;
      case 'task-workspace':
        await dependencies.manageTaskWorkspace(command.operation, command.taskId);
        break;
      case 'events-run-once':
        await dependencies.runEventsOnce();
        break;
      case 'maintenance-run-once':
        await dependencies.runMaintenanceOnce();
        break;
      case 'risk-classify':
        await dependencies.classifyRisk(command.planPath);
        break;
      case 'knowledge-check':
        await dependencies.checkKnowledge();
        break;
    }
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

function parseEvents(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 3 && args[1] === 'run' && args[2] === '--once') {
    return { kind: 'events-run-once' };
  }
  throw new CliUsageError('Usage: backendkit events run --once');
}

function parseMaintenance(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 3 && args[1] === 'run' && args[2] === '--once') {
    return { kind: 'maintenance-run-once' };
  }
  throw new CliUsageError('Usage: backendkit maintenance run --once');
}

function parseVerify(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 1) return { kind: 'verify', profile: 'fast' };
  if (args.length !== 3 || args[1] !== '--profile') {
    throw new CliUsageError('Usage: backendkit verify [--profile fast|full|runtime|ci]');
  }
  const profile = parseVerificationProfileId(args[2]);
  if (!profile) throw new CliUsageError(`Unknown verification profile '${args[2]}'`);
  return { kind: 'verify', profile };
}

function parseTask(args: ReadonlyArray<string>): BackendkitCommand {
  if (args[1] === 'begin' && args.length === 4 && args[2] === '--plan' && args[3]) {
    return { kind: 'task-begin', planPath: args[3] };
  }
  if (args[1] === 'preflight') {
    const taskId = optionValue(args.slice(2), '--task');
    const actionValue = optionValue(args.slice(2), '--action', false) ?? 'verify';
    assertOnlyOptions(args.slice(2), ['--task', '--action']);
    if (!taskId) throw new CliUsageError('Missing required option --task.');
    try {
      return { kind: 'task-preflight', taskId, action: parseTaskAction(actionValue) };
    } catch (error: unknown) {
      throw new CliUsageError(error instanceof Error ? error.message : String(error));
    }
  }
  if (args[1] === 'verify' && args.length === 4 && args[2] === '--task' && args[3]) {
    return { kind: 'task-verify', taskId: args[3] };
  }
  if (
    args[1] === 'workspace' &&
    (args[2] === 'prepare' ||
      args[2] === 'status' ||
      args[2] === 'cancel' ||
      args[2] === 'cleanup') &&
    args.length === 5 &&
    args[3] === '--task' &&
    args[4]
  ) {
    return { kind: 'task-workspace', operation: args[2], taskId: args[4] };
  }
  throw new CliUsageError(
    'Usage: backendkit task begin --plan <path> | task preflight --task <id> [--action <action>] | task verify --task <id> | task workspace prepare|status|cancel|cleanup --task <id>',
  );
}

function parseRisk(args: ReadonlyArray<string>): BackendkitCommand {
  if (args[1] !== 'classify')
    throw new CliUsageError('Usage: backendkit risk classify [--plan <path>]');
  if (args.length === 2) return { kind: 'risk-classify' };
  if (args.length === 4 && args[2] === '--plan' && args[3]) {
    return { kind: 'risk-classify', planPath: args[3] };
  }
  throw new CliUsageError('Usage: backendkit risk classify [--plan <path>]');
}

function parseKnowledge(args: ReadonlyArray<string>): BackendkitCommand {
  if (args.length === 2 && args[1] === 'check') return { kind: 'knowledge-check' };
  throw new CliUsageError('Usage: backendkit knowledge check');
}

function optionValue(
  args: ReadonlyArray<string>,
  option: string,
  required = true,
): string | undefined {
  const index = args.indexOf(option);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) {
    throw new CliUsageError(`Missing required option ${option}.`);
  }
  return value && !value.startsWith('--') ? value : undefined;
}

function assertOnlyOptions(args: ReadonlyArray<string>, allowed: ReadonlyArray<string>): void {
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    if (!option || !allowed.includes(option) || !args[index + 1]) {
      throw new CliUsageError('Task preflight options must be complete option/value pairs.');
    }
  }
}
