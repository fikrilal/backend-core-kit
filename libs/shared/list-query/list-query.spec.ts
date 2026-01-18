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
  it('accumulates issues (q + limit)', () => {
    try {
      parseListQuery(
        { q: 'hello', limit: '999' },
        {
          maxLimit: 250,
          sort: {
            allowed: SORT_ALLOWED,
            default: [{ field: 'createdAt', direction: 'desc' }],
            tieBreaker: { field: 'id', direction: 'asc' },
          },
        },
      );
      throw new Error('expected parseListQuery to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ListQueryValidationError);
      expect((err as ListQueryValidationError).issues).toEqual([
        { field: 'limit', message: 'limit must be at most 250' },
        { field: 'q', message: 'Search is not supported' },
      ]);
    }
  });

  it('trims q when search enabled', () => {
    const q = parseListQuery(
      { q: '  hello  ' },
      {
        search: true,
        sort: {
          allowed: SORT_ALLOWED,
          default: [{ field: 'createdAt', direction: 'desc' }],
          tieBreaker: { field: 'id', direction: 'asc' },
        },
      },
    );

    expect(q.q).toBe('hello');
  });

  it('falls back to default limit for non-numeric input', () => {
    const q = parseListQuery(
      { limit: 'nope' },
      {
        defaultLimit: 10,
        sort: {
          allowed: SORT_ALLOWED,
          default: [{ field: 'createdAt', direction: 'desc' }],
          tieBreaker: { field: 'id', direction: 'asc' },
        },
      },
    );

    expect(q.limit).toBe(10);
  });

  it('rejects filtering when unsupported (but allows empty filter)', () => {
    expect(() =>
      parseListQuery(
        { filter: { status: 'ACTIVE' } },
        {
          sort: {
            allowed: SORT_ALLOWED,
            default: [{ field: 'createdAt', direction: 'desc' }],
            tieBreaker: { field: 'id', direction: 'asc' },
          },
        },
      ),
    ).toThrow(ListQueryValidationError);

    const q = parseListQuery(
      { filter: {} },
      {
        sort: {
          allowed: SORT_ALLOWED,
          default: [{ field: 'createdAt', direction: 'desc' }],
          tieBreaker: { field: 'id', direction: 'asc' },
        },
      },
    );
    expect(q.filters).toEqual([]);
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

  it('rejects cursor when current sort differs from cursor sort', () => {
    const cursor = encodeCursorV1({
      v: 1 as const,
      sort: '-createdAt,id',
      after: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(() =>
      parseListQuery(
        { cursor, sort: 'id' },
        {
          sort: {
            allowed: SORT_ALLOWED,
            default: [{ field: 'createdAt', direction: 'desc' }],
            tieBreaker: { field: 'id', direction: 'asc' },
          },
          filters: FILTERS,
        },
      ),
    ).toThrow(ListQueryValidationError);
  });
});
