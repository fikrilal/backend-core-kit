import { encodeCursorV1 } from './cursor';
import { ListQueryValidationError } from './errors';
import { parseListQuery } from './list-query';

const SORT_ALLOWED = {
  createdAt: { type: 'datetime' },
  id: { type: 'uuid' },
} as const;

const FILTERS = {
  status: { type: 'enum', ops: ['eq'], enumValues: ['ACTIVE'] },
} as const;

describe('parseListQuery', () => {
  it('rejects q when search disabled', () => {
    expect(() =>
      parseListQuery(
        { q: 'hello' },
        {
          sort: {
            allowed: SORT_ALLOWED,
            default: [{ field: 'createdAt', direction: 'desc' }],
            tieBreaker: { field: 'id', direction: 'asc' },
          },
        },
      ),
    ).toThrow(ListQueryValidationError);
  });

  it('validates cursor against normalized sort', () => {
    const cursor = encodeCursorV1({
      v: 1 as const,
      sort: '-createdAt,id',
      after: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      },
    });

    const q = parseListQuery(
      { cursor },
      {
        sort: {
          allowed: SORT_ALLOWED,
          default: [{ field: 'createdAt', direction: 'desc' }],
          tieBreaker: { field: 'id', direction: 'asc' },
        },
        filters: FILTERS,
      },
    );

    expect(q.cursor?.sort).toBe('-createdAt,id');
  });
});
