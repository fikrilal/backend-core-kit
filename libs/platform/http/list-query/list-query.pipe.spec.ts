import { ListQueryPipe } from './list-query.pipe';
import { ProblemException } from '../errors/problem.exception';
import type { ParseSortOptions } from '../../../shared/list-query';

describe('ListQueryPipe', () => {
  type SortField = 'createdAt' | 'id';

  const sort = {
    allowed: {
      createdAt: { type: 'datetime' },
      id: { type: 'uuid' },
    },
    default: [{ field: 'createdAt', direction: 'desc' }] as const,
    tieBreaker: { field: 'id', direction: 'asc' } as const,
    maxFields: 3,
  } as const satisfies ParseSortOptions<SortField>;

  it('allows endpoint maxLimit > 250', () => {
    const pipe = new ListQueryPipe<SortField, never>({
      maxLimit: 500,
      sort,
    });

    const parsed = pipe.transform({ limit: '300' });
    expect(parsed.limit).toBe(300);
  });

  it('rejects limit over configured maxLimit', () => {
    const pipe = new ListQueryPipe<SortField, never>({
      maxLimit: 250,
      sort,
    });

    try {
      pipe.transform({ limit: '300' });
      throw new Error('Expected transform to throw');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ProblemException);
      const ex = err as ProblemException;
      expect(ex.getStatus()).toBe(400);
      expect(ex.getResponse()).toMatchObject({
        title: 'Validation Failed',
        code: 'VALIDATION_FAILED',
      });
    }
  });
});
