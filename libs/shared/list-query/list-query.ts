import { ListQueryValidationError, type ListQueryIssue } from './errors';
import { decodeCursorV1 } from './cursor';
import { parseFilters } from './filter';
import { parseSort, type ParseSortOptions } from './sort';
import type { FilterAllowlist, ListQuery, SortSpec } from './types';

export type ListQueryInput = Readonly<{
  limit?: unknown;
  cursor?: unknown;
  sort?: unknown;
  q?: unknown;
  filter?: unknown;
}>;

export type ListQueryOptions<SortField extends string, FilterField extends string> = Readonly<{
  defaultLimit?: number;
  maxLimit?: number;
  search?: boolean;
  sort: ParseSortOptions<SortField>;
  filters?: FilterAllowlist<FilterField>;
}>;

function parseLimit(raw: unknown, defaultLimit: number): number {
  if (raw === undefined || raw === null || raw === '') return defaultLimit;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return n;
  }
  return defaultLimit;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function parseListQuery<SortField extends string, FilterField extends string>(
  input: ListQueryInput,
  options: ListQueryOptions<SortField, FilterField>,
): ListQuery<SortField, FilterField> {
  const issues: ListQueryIssue[] = [];

  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 250;
  const limit = parseLimit(input.limit, defaultLimit);

  if (!Number.isInteger(limit) || limit < 1) {
    issues.push({ field: 'limit', message: 'limit must be a positive integer' });
  } else if (limit > maxLimit) {
    issues.push({ field: 'limit', message: `limit must be at most ${maxLimit}` });
  }

  const { sort, normalizedSort } = parseSort(input.sort, {
    ...options.sort,
    maxFields: options.sort.maxFields ?? 3,
  });

  const filters = options.filters
    ? parseFilters(input.filter, options.filters)
    : (() => {
        if (input.filter === undefined || input.filter === null) return [];
        if (typeof input.filter === 'object' && input.filter !== null) {
          const keys = Object.keys(input.filter as Record<string, unknown>);
          if (keys.length === 0) return [];
        }
        throw new ListQueryValidationError([
          { field: 'filter', message: 'Filtering is not supported' },
        ]);
      })();

  const q = (() => {
    if (!isNonEmptyString(input.q)) return undefined;
    if (options.search !== true) {
      issues.push({ field: 'q', message: 'Search is not supported' });
      return undefined;
    }
    return input.q.trim();
  })();

  const cursorRaw = isNonEmptyString(input.cursor) ? input.cursor.trim() : undefined;

  const cursor = cursorRaw
    ? decodeCursorV1(cursorRaw, {
        expectedSort: normalizedSort,
        sortFields: sort.map((s: SortSpec<SortField>) => s.field),
        allowed: options.sort.allowed,
      })
    : undefined;

  if (issues.length > 0) {
    throw new ListQueryValidationError(issues);
  }

  return {
    limit,
    sort,
    normalizedSort,
    ...(cursor ? { cursor } : {}),
    ...(cursorRaw ? { cursorRaw } : {}),
    filters,
    ...(q ? { q } : {}),
  };
}
