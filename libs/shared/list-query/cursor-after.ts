import type { Scalar, SortSpec } from './types';

export type CursorAfterValues<Field extends string> = Readonly<Partial<Record<Field, Scalar>>>;

export type CursorAfterBuilders<Field extends string, Where> = Readonly<{
  equals: (field: Field, value: Scalar) => Where;
  compare: (field: Field, direction: 'asc' | 'desc', value: Scalar) => Where;
  and: (clauses: ReadonlyArray<Where>) => Where;
  or: (clauses: ReadonlyArray<Where>) => Where;
  empty: () => Where;
}>;

type BuildCursorAfterWhereInput<Field extends string, Where> = Readonly<{
  sort: ReadonlyArray<SortSpec<Field>>;
  after: CursorAfterValues<Field>;
  builders: CursorAfterBuilders<Field, Where>;
}>;

function getAfterValue<Field extends string>(
  after: CursorAfterValues<Field>,
  field: Field,
): Scalar {
  const value = after[field];
  if (value === undefined) {
    throw new Error(`Cursor missing value for sort field "${String(field)}"`);
  }
  return value;
}

export function buildCursorAfterWhere<Field extends string, Where>(
  input: BuildCursorAfterWhereInput<Field, Where>,
): Where {
  if (input.sort.length === 0) return input.builders.empty();

  const clauses: Where[] = [];

  for (let i = 0; i < input.sort.length; i += 1) {
    const and: Where[] = [];

    for (let j = 0; j < i; j += 1) {
      const field = input.sort[j].field;
      and.push(input.builders.equals(field, getAfterValue(input.after, field)));
    }

    const current = input.sort[i];
    and.push(
      input.builders.compare(
        current.field,
        current.direction,
        getAfterValue(input.after, current.field),
      ),
    );

    clauses.push(input.builders.and(and));
  }

  return input.builders.or(clauses);
}
