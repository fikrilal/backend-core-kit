import { Injectable, type PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ErrorCode } from '../errors/error-codes';
import { ProblemException } from '../errors/problem.exception';
import { flattenValidationErrors } from '../validation/validation-errors';
import { CursorPaginationQueryDto } from './cursor-pagination-query.dto';
import {
  ListQueryValidationError,
  parseListQuery,
  type FilterAllowlist,
  type ListQuery,
  type ParseSortOptions,
} from '../../../shared/list-query';

export type ListQueryPipeOptions<SortField extends string, FilterField extends string> = Readonly<{
  defaultLimit?: number;
  maxLimit?: number;
  search?: boolean;
  sort: ParseSortOptions<SortField>;
  filters?: FilterAllowlist<FilterField>;
}>;

@Injectable()
export class ListQueryPipe<
  SortField extends string,
  FilterField extends string,
> implements PipeTransform<unknown, ListQuery<SortField, FilterField>> {
  constructor(private readonly options: ListQueryPipeOptions<SortField, FilterField>) {}

  transform(value: unknown): ListQuery<SortField, FilterField> {
    const dto = plainToInstance(CursorPaginationQueryDto, (value ?? {}) as Record<string, unknown>);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
    });

    if (errors.length > 0) {
      throw new ProblemException(400, {
        title: 'Validation Failed',
        code: ErrorCode.VALIDATION_FAILED,
        errors: flattenValidationErrors(errors),
      });
    }

    try {
      return parseListQuery(dto, this.options);
    } catch (err: unknown) {
      if (err instanceof ListQueryValidationError) {
        throw new ProblemException(400, {
          title: 'Validation Failed',
          code: ErrorCode.VALIDATION_FAILED,
          errors: err.issues.map((i) => ({ field: i.field, message: i.message })),
        });
      }
      throw err;
    }
  }
}
