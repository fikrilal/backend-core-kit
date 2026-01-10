import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type {
  FilterAllowlist,
  FilterFieldConfig,
  FilterOperator,
  ParseSortOptions,
  SortSpec,
} from '../../../shared/list-query';

export type ApiListQueryOptions<SortField extends string, FilterField extends string> = Readonly<{
  defaultLimit?: number;
  maxLimit?: number;
  search?: boolean;
  searchDescription?: string;
  sort: ParseSortOptions<SortField>;
  filters?: FilterAllowlist<FilterField>;
}>;

function sortSpecToString<Field extends string>(spec: ReadonlyArray<SortSpec<Field>>): string {
  return spec.map((s) => (s.direction === 'desc' ? `-${s.field}` : String(s.field))).join(',');
}

function formatType(config: FilterFieldConfig): { type: string; format?: string; enum?: string[] } {
  switch (config.type) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    case 'enum':
      return { type: 'string', enum: [...(config.enumValues ?? [])] };
    case 'string':
      return { type: 'string' };
  }
}

function filterParamName(field: string, op?: FilterOperator): string {
  return op ? `filter[${field}][${op}]` : `filter[${field}]`;
}

export function ApiListQuery<SortField extends string, FilterField extends string>(
  options: ApiListQueryOptions<SortField, FilterField>,
): MethodDecorator & ClassDecorator {
  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 250;
  const maxSortFields = options.sort.maxFields ?? 3;

  const allowedSortFields = Object.keys(options.sort.allowed).sort();
  const effectiveDefaultSort = sortSpecToString(options.sort.default);

  const decorators: Array<MethodDecorator & ClassDecorator> = [
    ApiQuery({
      name: 'limit',
      required: false,
      description: `Max results to return (default ${defaultLimit}, max ${maxLimit}).`,
      schema: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit },
    }),
    ApiQuery({
      name: 'cursor',
      required: false,
      description: 'Opaque cursor from the previous response meta.nextCursor.',
      schema: { type: 'string' },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      description: `Comma-separated fields; prefix "-" for descending. Max ${maxSortFields} fields. Default: "${effectiveDefaultSort}". Allowed: ${allowedSortFields.join(
        ', ',
      )}`,
      schema: { type: 'string', example: effectiveDefaultSort },
    }),
  ];

  if (options.search) {
    decorators.push(
      ApiQuery({
        name: 'q',
        required: false,
        description:
          options.searchDescription ?? 'Free-text search query (endpoint-specific semantics).',
        schema: { type: 'string' },
      }),
    );
  }

  if (options.filters) {
    const fields = Object.keys(options.filters).sort();
    for (const field of fields) {
      const config = options.filters[field as FilterField];
      const typeInfo = formatType(config);

      if (config.ops.includes('eq')) {
        decorators.push(
          ApiQuery({
            name: filterParamName(field),
            required: false,
            schema: { ...typeInfo },
          }),
        );
      }

      if (config.ops.includes('in')) {
        decorators.push(
          ApiQuery({
            name: filterParamName(field, 'in'),
            required: false,
            description: 'Comma-separated list (no repeated params).',
            schema: { type: 'string', example: 'A,B,C' },
          }),
        );
      }

      if (config.ops.includes('gte')) {
        decorators.push(
          ApiQuery({
            name: filterParamName(field, 'gte'),
            required: false,
            schema: { ...typeInfo },
          }),
        );
      }

      if (config.ops.includes('lte')) {
        decorators.push(
          ApiQuery({
            name: filterParamName(field, 'lte'),
            required: false,
            schema: { ...typeInfo },
          }),
        );
      }
    }
  }

  return applyDecorators(...decorators);
}
