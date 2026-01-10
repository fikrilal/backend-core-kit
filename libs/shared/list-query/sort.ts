import { ListQueryValidationError, type ListQueryIssue } from './errors';
import type { SortAllowlist, SortDirection, SortSpec } from './types';

export type ParseSortOptions<Field extends string> = Readonly<{
  allowed: SortAllowlist<Field>;
  default: ReadonlyArray<SortSpec<Field>>;
  maxFields?: number;
  tieBreaker: SortSpec<Field>;
}>;

function normalizeSort<Field extends string>(sort: ReadonlyArray<SortSpec<Field>>): string {
  return sort.map((s) => (s.direction === 'desc' ? `-${s.field}` : String(s.field))).join(',');
}

function hasField<Field extends string>(
  sort: ReadonlyArray<SortSpec<Field>>,
  field: Field,
): boolean {
  return sort.some((s) => s.field === field);
}

export function parseSort<Field extends string>(
  raw: unknown,
  options: ParseSortOptions<Field>,
): { sort: ReadonlyArray<SortSpec<Field>>; normalizedSort: string } {
  const maxFields = options.maxFields ?? 3;
  const issues: ListQueryIssue[] = [];

  const allowedFields = Object.keys(options.allowed) as Field[];
  const allowedSet = new Set<string>(allowedFields);

  if (!allowedSet.has(options.tieBreaker.field)) {
    throw new Error(
      `ListQuery misconfigured: tieBreaker "${options.tieBreaker.field}" must be included in allowed sort fields`,
    );
  }

  const tokens: string[] = [];
  if (raw === undefined || raw === null || raw === '') {
    // empty -> default
  } else if (typeof raw === 'string') {
    tokens.push(
      ...raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== ''),
    );
  } else {
    issues.push({ field: 'sort', message: 'sort must be a string' });
  }

  const userSort: Array<SortSpec<Field>> = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const direction: SortDirection = token.startsWith('-') ? 'desc' : 'asc';
    const field = (token.startsWith('-') ? token.slice(1) : token).trim();
    if (!allowedSet.has(field)) {
      issues.push({ field: 'sort', message: `Unsupported sort field "${field}"` });
      continue;
    }
    if (seen.has(field)) {
      issues.push({ field: 'sort', message: `Duplicate sort field "${field}"` });
      continue;
    }
    seen.add(field);
    userSort.push({ field: field as Field, direction });
  }

  if (userSort.length > maxFields) {
    issues.push({ field: 'sort', message: `sort supports at most ${maxFields} fields` });
  }

  if (issues.length > 0) {
    throw new ListQueryValidationError(issues);
  }

  const baseSort = userSort.length > 0 ? userSort : [...options.default];

  if (baseSort.length === 0) {
    throw new Error('ListQuery misconfigured: default sort must not be empty');
  }

  const sort = hasField(baseSort, options.tieBreaker.field)
    ? baseSort
    : [...baseSort, options.tieBreaker];

  const normalizedSort = normalizeSort(sort);
  return { sort, normalizedSort };
}
