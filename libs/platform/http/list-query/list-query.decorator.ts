import { Query } from '@nestjs/common';
import { ListQueryPipe, type ListQueryPipeOptions } from './list-query.pipe';

export function ListQueryParam<SortField extends string, FilterField extends string>(
  options: ListQueryPipeOptions<SortField, FilterField>,
): ParameterDecorator {
  return Query(new ListQueryPipe(options)) as unknown as ParameterDecorator;
}
