export type SortDirection = 'asc' | 'desc';

export type SortSpec<Field extends string = string> = Readonly<{
  field: Field;
  direction: SortDirection;
}>;

export type CursorFieldType = 'string' | 'uuid' | 'datetime' | 'number' | 'boolean';
export type FilterFieldType = CursorFieldType | 'enum';

export type FilterOperator = 'eq' | 'in' | 'gte' | 'lte';

export type Scalar = string | number | boolean;

export type FilterExpr<Field extends string = string> =
  | Readonly<{ field: Field; op: 'eq'; value: Scalar }>
  | Readonly<{ field: Field; op: 'in'; value: ReadonlyArray<Scalar> }>
  | Readonly<{ field: Field; op: 'gte' | 'lte'; value: Scalar }>;

export type FilterFieldConfig = Readonly<{
  type: FilterFieldType;
  ops: ReadonlyArray<FilterOperator>;
  enumValues?: ReadonlyArray<string>;
}>;

export type FilterAllowlist<Field extends string = string> = Readonly<
  Record<Field, FilterFieldConfig>
>;

export type SortFieldConfig = Readonly<{
  type: CursorFieldType;
}>;

export type SortAllowlist<Field extends string = string> = Readonly<Record<Field, SortFieldConfig>>;

export type CursorPayloadV1<Field extends string = string> = Readonly<{
  v: 1;
  sort: string;
  after: Readonly<Partial<Record<Field, Scalar>>>;
}>;

export type ListQuery<
  SortField extends string = string,
  FilterField extends string = string,
> = Readonly<{
  limit: number;
  sort: ReadonlyArray<SortSpec<SortField>>;
  normalizedSort: string;
  cursor?: CursorPayloadV1<SortField>;
  cursorRaw?: string;
  filters: ReadonlyArray<FilterExpr<FilterField>>;
  q?: string;
}>;
