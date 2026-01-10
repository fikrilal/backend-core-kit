import { ListQueryValidationError, type ListQueryIssue } from './errors';
import { parseScalar } from './scalars';
import type { CursorPayloadV1, SortAllowlist, Scalar } from './types';

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function encodeCursorV1<Field extends string>(payload: CursorPayloadV1<Field>): string {
  return base64UrlEncode(JSON.stringify(payload));
}

export type DecodeCursorV1Options<Field extends string> = Readonly<{
  expectedSort: string;
  sortFields: ReadonlyArray<Field>;
  allowed: SortAllowlist<Field>;
}>;

export function decodeCursorV1<Field extends string>(
  cursor: string,
  options: DecodeCursorV1Options<Field>,
): CursorPayloadV1<Field> {
  const issues: ListQueryIssue[] = [];

  let decoded: string;
  try {
    decoded = base64UrlDecode(cursor);
  } catch {
    throw new ListQueryValidationError([{ field: 'cursor', message: 'Invalid cursor encoding' }]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw new ListQueryValidationError([{ field: 'cursor', message: 'Invalid cursor JSON' }]);
  }

  if (!isPlainObject(parsed)) {
    throw new ListQueryValidationError([{ field: 'cursor', message: 'Invalid cursor payload' }]);
  }

  const v = parsed.v;
  const sort = parsed.sort;
  const after = parsed.after;

  if (v !== 1) {
    issues.push({ field: 'cursor', message: 'Unsupported cursor version' });
  }

  if (typeof sort !== 'string' || sort.trim() === '') {
    issues.push({ field: 'cursor', message: 'Cursor sort is missing' });
  } else if (sort !== options.expectedSort) {
    issues.push({ field: 'cursor', message: 'Cursor does not match the current sort' });
  }

  if (!isPlainObject(after)) {
    issues.push({ field: 'cursor', message: 'Cursor "after" is missing' });
  }

  if (issues.length > 0) {
    throw new ListQueryValidationError(issues);
  }

  const allowedFields = Object.keys(options.allowed) as Field[];
  const allowedSet = new Set<string>(allowedFields);

  const afterObj = after as Record<string, unknown>;
  const outAfter: Partial<Record<Field, Scalar>> = {};

  for (const [fieldRaw, value] of Object.entries(afterObj)) {
    if (!allowedSet.has(fieldRaw)) {
      issues.push({ field: 'cursor', message: 'Cursor contains unsupported fields' });
      continue;
    }

    const field = fieldRaw as Field;
    const type = options.allowed[field].type;
    const parsedValue = parseScalar(type, value);
    if (parsedValue === undefined) {
      issues.push({ field: 'cursor', message: `Invalid cursor value for "${fieldRaw}"` });
      continue;
    }

    outAfter[field] = parsedValue;
  }

  for (const field of options.sortFields) {
    if (outAfter[field] === undefined) {
      issues.push({ field: 'cursor', message: `Cursor is missing field "${String(field)}"` });
    }
  }

  if (issues.length > 0) {
    throw new ListQueryValidationError(issues);
  }

  return { v: 1, sort: options.expectedSort, after: outAfter };
}
