import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export type Risk = 'low' | 'medium' | 'high';

export type TaskAction =
  'edit' | 'verify' | 'commit' | 'push' | 'draft-pr' | 'update-pr' | 'merge' | 'migrate' | 'deploy';

export type TaskPlanStatus = 'active' | 'queued' | 'completed';

export type TaskBoundaries = Readonly<{
  allowedPaths: ReadonlyArray<string>;
  allowedActions: ReadonlyArray<TaskAction>;
  maximumRisk: Risk;
  repairLimit: number;
  timeoutMs: number;
}>;

export type TaskPlan = Readonly<{
  version: 2;
  path: string;
  taskId: string;
  status: TaskPlanStatus;
  owner: string;
  risk: Risk;
  authority: string;
  boundaries: TaskBoundaries;
  sourceHash: string;
  authorityHash: string;
}>;

export class TaskPlanError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskPlanError';
  }
}

const riskOrder: Readonly<Record<Risk, number>> = { low: 0, medium: 1, high: 2 };
const actions: ReadonlyArray<TaskAction> = [
  'edit',
  'verify',
  'commit',
  'push',
  'draft-pr',
  'update-pr',
  'merge',
  'migrate',
  'deploy',
];

export function parseTaskPlan(path: string, source: string): TaskPlan {
  const version = requiredMetadata(source, 'Plan version');
  if (version !== '2') throw planError('plan-version', 'Plan version must be 2.');

  const taskId = requiredMetadata(source, 'Task ID');
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) {
    throw planError('task-id', 'Task ID must be a 3-80 character lowercase kebab-case value.');
  }

  const status = parseStatus(requiredMetadata(source, 'Status'));
  const owner = requiredMetadata(source, 'Owner');
  const risk = parseRisk(requiredMetadata(source, 'Risk'), 'Risk');
  const authority = requiredMetadata(source, 'Authority');
  const allowedPaths = parseList(source, 'Allowed paths').map(normalizeAllowedPath);
  const allowedActions = parseList(source, 'Allowed actions').map(parseTaskAction);
  const maximumRisk = parseRisk(requiredMetadata(source, 'Maximum risk'), 'Maximum risk');
  const repairLimit = parseWholeNumber(requiredMetadata(source, 'Repair limit'), 'Repair limit');
  const timeoutMs = parseDuration(requiredMetadata(source, 'Task timeout'));

  assertUnique(allowedPaths, 'Allowed paths');
  assertUnique(allowedActions, 'Allowed actions');
  if (riskOrder[risk] > riskOrder[maximumRisk]) {
    throw planError('risk-authority', 'Declared Risk cannot exceed Maximum risk.');
  }

  const boundaries: TaskBoundaries = {
    allowedPaths,
    allowedActions,
    maximumRisk,
    repairLimit,
    timeoutMs,
  };
  const authorityMaterial = JSON.stringify({
    version: 2,
    taskId,
    owner,
    risk,
    authority,
    boundaries,
  });

  return {
    version: 2,
    path: normalizeRepositoryPath(path),
    taskId,
    status,
    owner,
    risk,
    authority,
    boundaries,
    sourceHash: hash(source),
    authorityHash: hash(authorityMaterial),
  };
}

export function parseRisk(value: string, label = 'risk'): Risk {
  switch (value.trim().toLowerCase()) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      throw planError('risk-invalid', `${label} must be low, medium, or high.`);
  }
}

export function maximumRisk(values: ReadonlyArray<Risk>): Risk {
  return values.reduce<Risk>(
    (highest, value) => (riskOrder[value] > riskOrder[highest] ? value : highest),
    'low',
  );
}

export function isRiskAbove(value: Risk, maximum: Risk): boolean {
  return riskOrder[value] > riskOrder[maximum];
}

export function normalizeRepositoryPath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw planError('path-invalid', `Path must stay inside the repository: '${value}'.`);
  }
  return normalized;
}

export function findScopeViolations(
  paths: ReadonlyArray<string>,
  allowedPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return paths.filter(
    (path) =>
      !allowedPaths.some((allowed) =>
        allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed,
      ),
  );
}

export function assertActionAllowed(boundaries: TaskBoundaries, action: TaskAction): void {
  if (!boundaries.allowedActions.includes(action)) {
    throw planError('action-not-authorized', `Task plan does not authorize '${action}'.`);
  }
}

export async function assertAllowedPathsStayInRepository(
  root: string,
  allowedPaths: ReadonlyArray<string>,
): Promise<void> {
  const canonicalRoot = await realpath(root);
  for (const allowedPath of allowedPaths) {
    let candidate = resolve(root, allowedPath);
    while (candidate !== root) {
      try {
        await lstat(candidate);
        break;
      } catch {
        candidate = dirname(candidate);
      }
    }
    const canonicalCandidate = await realpath(candidate);
    const fromRoot = relative(canonicalRoot, canonicalCandidate);
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    ) {
      throw planError(
        'path-symlink-escape',
        `Allowed path escapes through a symlink: '${allowedPath}'.`,
      );
    }
  }
}

function requiredMetadata(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...source.matchAll(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'gm'))];
  if (matches.length !== 1) {
    throw planError(
      'metadata-cardinality',
      `Plan must contain exactly one non-empty '**${name}:**' field.`,
    );
  }
  const value = matches[0]?.[1]?.trim();
  if (!value) throw planError('metadata-empty', `Plan metadata '${name}' cannot be empty.`);
  return value;
}

function parseList(source: string, name: string): ReadonlyArray<string> {
  const values = requiredMetadata(source, name)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) throw planError('list-empty', `${name} must not be empty.`);
  return values;
}

function normalizeAllowedPath(value: string): string {
  const normalized = normalizeRepositoryPath(value);
  if (/[*?[\]{}!]/.test(normalized) || /\s/.test(normalized) || normalized.includes('//')) {
    throw planError(
      'allowed-path-ambiguous',
      `Allowed path must be an explicit file or directory prefix: '${value}'.`,
    );
  }
  return normalized;
}

export function parseTaskAction(value: string): TaskAction {
  const normalized = value.toLowerCase();
  const action = actions.find((candidate) => candidate === normalized);
  if (!action) throw planError('action-invalid', `Unsupported task action: '${value}'.`);
  return action;
}

function parseStatus(value: string): TaskPlanStatus {
  switch (value.trim().toLowerCase()) {
    case 'active':
      return 'active';
    case 'queued':
      return 'queued';
    case 'completed':
      return 'completed';
    default:
      throw planError('status-invalid', 'Status must be active, queued, or completed.');
  }
}

function parseWholeNumber(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw planError('number-invalid', `${label} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw planError('number-invalid', `${label} is too large.`);
  return parsed;
}

function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(value.trim().toLowerCase());
  if (!match)
    throw planError('timeout-invalid', 'Task timeout must use seconds, minutes, or hours.');
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000;
  const duration = amount * multiplier;
  if (amount <= 0 || duration > 24 * 3_600_000) {
    throw planError('timeout-invalid', 'Task timeout must be greater than zero and at most 24h.');
  }
  return duration;
}

function assertUnique(values: ReadonlyArray<string>, label: string): void {
  if (new Set(values).size !== values.length) {
    throw planError('list-duplicate', `${label} must not contain duplicates.`);
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function planError(code: string, message: string): TaskPlanError {
  return new TaskPlanError(code, message);
}
