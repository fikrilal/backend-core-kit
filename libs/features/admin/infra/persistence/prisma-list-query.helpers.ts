import type { CursorAfterBuilders, Scalar } from '../../../../shared/list-query';

type CursorFieldOps<Where> = Readonly<{
  equals: (value: Scalar) => Where;
  gt: (value: Scalar) => Where;
  lt: (value: Scalar) => Where;
}>;

type CursorWhereCombiners<Where> = Readonly<{
  and: (clauses: ReadonlyArray<Where>) => Where;
  or: (clauses: ReadonlyArray<Where>) => Where;
  empty: () => Where;
}>;

type CreateCursorAfterBuildersInput<Field extends string, Where> = Readonly<{
  fieldOps: Readonly<Record<Field, CursorFieldOps<Where>>>;
  combiners: CursorWhereCombiners<Where>;
}>;

type MergeWhereClausesInput<Where> = Readonly<{
  clauses: ReadonlyArray<Where>;
  empty: () => Where;
  and: (clauses: ReadonlyArray<Where>) => Where;
  isEmpty: (clause: Where) => boolean;
}>;

export function createCursorAfterBuilders<Field extends string, Where>(
  input: CreateCursorAfterBuildersInput<Field, Where>,
): CursorAfterBuilders<Field, Where> {
  return {
    equals: (field, value) => input.fieldOps[field].equals(value),
    compare: (field, direction, value) =>
      direction === 'asc' ? input.fieldOps[field].gt(value) : input.fieldOps[field].lt(value),
    and: input.combiners.and,
    or: input.combiners.or,
    empty: input.combiners.empty,
  };
}

export function mergeWhereClauses<Where>(input: MergeWhereClausesInput<Where>): Where {
  const nonEmpty = input.clauses.filter((clause) => !input.isEmpty(clause));
  if (nonEmpty.length === 0) return input.empty();
  if (nonEmpty.length === 1) return nonEmpty[0];
  return input.and(nonEmpty);
}

export function parseCursorStringValue(field: string, value: Scalar): string {
  if (typeof value !== 'string') {
    throw new Error(`Cursor value for ${field} must be a string`);
  }
  return value;
}

export function parseCursorDateValue(field: string, value: Scalar): Date {
  const raw = parseCursorStringValue(field, value);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cursor value for ${field} must be an ISO datetime string`);
  }
  return parsed;
}

export function isEmptyWhereObject(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).length === 0;
}
