import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { normalizeRepositoryPath } from '../task/task-plan';

const maxReceiptBytes = 16 * 1024;

export type EventReceipt = Readonly<{
  schemaVersion: 1;
  eventId: string;
  source: 'queued-plan';
  status: 'claimed' | 'accepted';
  taskId: string;
  queuedPlanPath: string;
  activePlanPath: string;
  queuedSourceHash: string;
  activeSourceHash: string;
  authorityHash: string;
  receivedAt: string;
  completedAt?: string;
}>;

export interface EventReceiptStore {
  create(receipt: EventReceipt): Promise<void>;
  read(eventId: string): Promise<EventReceipt>;
  write(receipt: EventReceipt): Promise<void>;
  list(): Promise<ReadonlyArray<EventReceipt>>;
}

export class EventReceiptError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EventReceiptError';
  }
}

export class FileEventReceiptStore implements EventReceiptStore {
  constructor(private readonly root: string) {}

  async create(receipt: EventReceipt): Promise<void> {
    const path = this.pathFor(receipt.eventId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await writeReceipt(path, receipt, 'wx');
    } catch (error: unknown) {
      if (isCode(error, 'EEXIST')) {
        throw new EventReceiptError(
          'event-receipt-exists',
          `Event receipt already exists for '${receipt.eventId}'.`,
        );
      }
      throw error;
    }
  }

  async read(eventId: string): Promise<EventReceipt> {
    try {
      const source = await readFile(this.pathFor(eventId));
      if (source.byteLength > maxReceiptBytes) {
        throw new EventReceiptError(
          'event-receipt-too-large',
          `Event receipt exceeds ${maxReceiptBytes} bytes.`,
        );
      }
      return validateEventReceipt(JSON.parse(source.toString('utf8')));
    } catch (error: unknown) {
      if (error instanceof EventReceiptError) throw error;
      if (isCode(error, 'ENOENT')) {
        throw new EventReceiptError(
          'event-receipt-missing',
          `Event receipt does not exist for '${eventId}'.`,
        );
      }
      throw new EventReceiptError('event-receipt-invalid', 'Event receipt is unreadable.');
    }
  }

  async write(receipt: EventReceipt): Promise<void> {
    const path = this.pathFor(receipt.eventId);
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    await writeReceipt(temporary, receipt, 'wx');
    await rename(temporary, path);
  }

  async list(): Promise<ReadonlyArray<EventReceipt>> {
    const directory = resolve(this.root, '.tmp', 'backendkit', 'events');
    let files: ReadonlyArray<string>;
    try {
      const entries = (await readdir(directory)).sort();
      const unexpected = entries.filter(
        (name) =>
          !/^[0-9a-f]{64}\.json$/.test(name) &&
          !/^[0-9a-f]{64}\.json\.tmp-\d+-[0-9a-f-]+$/.test(name),
      );
      if (unexpected.length > 0) {
        throw new EventReceiptError(
          'event-receipt-directory-invalid',
          'Event receipt directory contains an unexpected artifact.',
        );
      }
      files = entries.filter((name) => /^[0-9a-f]{64}\.json$/.test(name));
    } catch (error: unknown) {
      if (isCode(error, 'ENOENT')) return [];
      throw error;
    }
    return await Promise.all(
      files.map(async (name) => await this.read(name.slice(0, -'.json'.length))),
    );
  }

  private pathFor(eventId: string): string {
    assertHash(eventId, 'event ID');
    return resolve(this.root, '.tmp', 'backendkit', 'events', `${eventId}.json`);
  }
}

export function validateEventReceipt(value: unknown): EventReceipt {
  if (!isObject(value) || value.schemaVersion !== 1) return invalidReceipt();
  assertKeys(value, [
    'schemaVersion',
    'eventId',
    'source',
    'status',
    'taskId',
    'queuedPlanPath',
    'activePlanPath',
    'queuedSourceHash',
    'activeSourceHash',
    'authorityHash',
    'receivedAt',
    'completedAt',
  ]);
  const eventId = hashField(value, 'eventId');
  const taskId = stringField(value, 'taskId');
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) return invalidReceipt();
  if (value.source !== 'queued-plan') return invalidReceipt();
  if (value.status !== 'claimed' && value.status !== 'accepted') return invalidReceipt();
  const completedAt = optionalDateField(value, 'completedAt');
  if (
    (value.status === 'claimed' && completedAt !== undefined) ||
    (value.status === 'accepted' && completedAt === undefined)
  ) {
    return invalidReceipt();
  }
  return {
    schemaVersion: 1,
    eventId,
    source: 'queued-plan',
    status: value.status,
    taskId,
    queuedPlanPath: queuedPath(stringField(value, 'queuedPlanPath')),
    activePlanPath: activePath(stringField(value, 'activePlanPath')),
    queuedSourceHash: hashField(value, 'queuedSourceHash'),
    activeSourceHash: hashField(value, 'activeSourceHash'),
    authorityHash: hashField(value, 'authorityHash'),
    receivedAt: dateField(value, 'receivedAt'),
    ...(completedAt ? { completedAt } : {}),
  };
}

async function writeReceipt(path: string, receipt: EventReceipt, flag: 'wx'): Promise<void> {
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag,
  });
}

function queuedPath(value: string): string {
  const path = normalizeRepositoryPath(value);
  if (!/^docs\/exec-plans\/queued\/[^/]+\.md$/.test(path)) return invalidReceipt();
  return path;
}

function activePath(value: string): string {
  const path = normalizeRepositoryPath(value);
  if (!/^docs\/exec-plans\/active\/[^/]+\.md$/.test(path)) return invalidReceipt();
  return path;
}

function assertKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) return invalidReceipt();
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) return invalidReceipt();
  return field;
}

function hashField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  assertHash(field, key);
  return field;
}

function assertHash(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new EventReceiptError('event-receipt-invalid', `${label} is invalid.`);
  }
}

function dateField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (Number.isNaN(Date.parse(field))) return invalidReceipt();
  return field;
}

function optionalDateField(value: Record<string, unknown>, key: string): string | undefined {
  if (value[key] === undefined) return undefined;
  return dateField(value, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function invalidReceipt(): never {
  throw new EventReceiptError('event-receipt-invalid', 'Event receipt is invalid.');
}
