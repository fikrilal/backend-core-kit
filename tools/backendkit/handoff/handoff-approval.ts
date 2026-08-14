import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { normalizeRepositoryPath } from '../task/task-plan';

export type PublicationAction = 'commit' | 'push' | 'draft-pr';
export type HandoffStatus = 'prepared' | 'executing' | 'completed' | 'uncertain';

export type HandoffApproval = Readonly<{
  schemaVersion: 1;
  taskId: string;
  action: PublicationAction;
  status: HandoffStatus;
  taskFingerprint: string;
  authorityHash: string;
  attempt: number;
  branch: string;
  remote: string;
  changedPaths: ReadonlyArray<string>;
  challengeHash: string;
  preparedAt: string;
  expiresAt: string;
  completedAt?: string;
  outcome?: string;
}>;

export interface HandoffApprovalStore {
  read(taskId: string, action: PublicationAction): Promise<HandoffApproval | undefined>;
  write(approval: HandoffApproval): Promise<void>;
}

export class HandoffApprovalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HandoffApprovalError';
  }
}

export class FileHandoffApprovalStore implements HandoffApprovalStore {
  constructor(private readonly root: string) {}

  async read(taskId: string, action: PublicationAction): Promise<HandoffApproval | undefined> {
    const path = this.pathFor(taskId, action);
    let source: Buffer;
    try {
      source = await readFile(path);
    } catch (error: unknown) {
      if (isCode(error, 'ENOENT')) return undefined;
      throw error;
    }
    if (source.byteLength > 32 * 1024) {
      throw new HandoffApprovalError(
        'handoff-approval-too-large',
        'Handoff approval is too large.',
      );
    }
    try {
      return parseHandoffApproval(JSON.parse(source.toString('utf8')));
    } catch (error: unknown) {
      if (error instanceof HandoffApprovalError) throw error;
      throw new HandoffApprovalError('handoff-approval-invalid', 'Handoff approval is unreadable.');
    }
  }

  async write(approval: HandoffApproval): Promise<void> {
    parseHandoffApproval(approval);
    const path = this.pathFor(approval.taskId, approval.action);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(approval, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  }

  private pathFor(taskId: string, action: PublicationAction): string {
    assertTaskId(taskId);
    assertAction(action);
    return resolve(this.root, '.tmp', 'backendkit', 'tasks', taskId, 'handoff', `${action}.json`);
  }
}

export function parseHandoffApproval(value: unknown): HandoffApproval {
  if (!isObject(value) || value.schemaVersion !== 1) return invalidApproval();
  const allowedKeys = new Set([
    'schemaVersion',
    'taskId',
    'action',
    'status',
    'taskFingerprint',
    'authorityHash',
    'attempt',
    'branch',
    'remote',
    'changedPaths',
    'challengeHash',
    'preparedAt',
    'expiresAt',
    'completedAt',
    'outcome',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return invalidApproval();
  const taskId = stringField(value, 'taskId');
  assertTaskId(taskId);
  const action = actionField(value.action);
  const status = statusField(value.status);
  const completedAt = optionalDateField(value, 'completedAt');
  const outcome = optionalStringField(value, 'outcome');
  if (
    (status === 'prepared' && (completedAt || outcome)) ||
    (status === 'executing' && (completedAt || outcome)) ||
    ((status === 'completed' || status === 'uncertain') && (!completedAt || !outcome))
  ) {
    return invalidApproval();
  }
  const changedPaths = stringArray(value.changedPaths).map(normalizeChangedPath);
  if (changedPaths.length === 0 || new Set(changedPaths).size !== changedPaths.length) {
    return invalidApproval();
  }
  return {
    schemaVersion: 1,
    taskId,
    action,
    status,
    taskFingerprint: hashField(value, 'taskFingerprint'),
    authorityHash: hashField(value, 'authorityHash'),
    attempt: positiveInteger(value.attempt),
    branch: branchField(value, 'branch'),
    remote: remoteField(value, 'remote'),
    changedPaths: [...changedPaths].sort(),
    challengeHash: hashField(value, 'challengeHash'),
    preparedAt: dateField(value, 'preparedAt'),
    expiresAt: dateField(value, 'expiresAt'),
    ...(completedAt ? { completedAt } : {}),
    ...(outcome ? { outcome } : {}),
  };
}

function actionField(value: unknown): PublicationAction {
  if (value !== 'commit' && value !== 'push' && value !== 'draft-pr') return invalidApproval();
  return value;
}

function statusField(value: unknown): HandoffStatus {
  if (
    value !== 'prepared' &&
    value !== 'executing' &&
    value !== 'completed' &&
    value !== 'uncertain'
  ) {
    return invalidApproval();
  }
  return value;
}

function branchField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^backendkit\/[a-z0-9-]+$/.test(field)) return invalidApproval();
  return field;
}

function remoteField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^[a-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(field)) return invalidApproval();
  return field;
}

function hashField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^[0-9a-f]{64}$/.test(field)) return invalidApproval();
  return field;
}

function dateField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (Number.isNaN(Date.parse(field))) return invalidApproval();
  return field;
}

function optionalDateField(value: Record<string, unknown>, key: string): string | undefined {
  if (value[key] === undefined) return undefined;
  return dateField(value, key);
}

function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  if (value[key] === undefined) return undefined;
  const field = stringField(value, key);
  if (field.length > 512 || /[\r\n]/.test(field)) return invalidApproval();
  return field;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0 || field.length > 512) {
    return invalidApproval();
  }
  return field;
}

function stringArray(value: unknown): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 512)
  ) {
    return invalidApproval();
  }
  return value;
}

function normalizeChangedPath(value: string): string {
  try {
    const normalized = normalizeRepositoryPath(value);
    if (normalized !== value) return invalidApproval();
    return normalized;
  } catch {
    return invalidApproval();
  }
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0) {
    return invalidApproval();
  }
  return value;
}

function assertTaskId(taskId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) return invalidApproval();
}

function assertAction(action: string): void {
  actionField(action);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function invalidApproval(): never {
  throw new HandoffApprovalError('handoff-approval-invalid', 'Handoff approval is invalid.');
}
