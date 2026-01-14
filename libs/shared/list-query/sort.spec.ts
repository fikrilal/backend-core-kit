import { ListQueryValidationError } from './errors';
import { parseSort } from './sort';

const ALLOWED = {
  createdAt: { type: 'datetime' },
  email: { type: 'string' },
  id: { type: 'uuid' },
} as const;

describe('parseSort', () => {
  it('uses default sort and appends tie-breaker when missing', () => {
    const res = parseSort(undefined, {
      allowed: ALLOWED,
      default: [{ field: 'createdAt', direction: 'desc' }],
      maxFields: 3,
      tieBreaker: { field: 'id', direction: 'asc' },
    });

    expect(res.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(res.normalizedSort).toBe('-createdAt,id');
  });

  it('parses user sort and enforces max fields', () => {
    const res = parseSort('-createdAt,email', {
      allowed: ALLOWED,
      default: [{ field: 'createdAt', direction: 'desc' }],
      maxFields: 3,
      tieBreaker: { field: 'id', direction: 'asc' },
    });

    expect(res.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'email', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(res.normalizedSort).toBe('-createdAt,email,id');
  });

  it('rejects unsupported sort fields', () => {
    expect(() =>
      parseSort('unknown', {
        allowed: ALLOWED,
        default: [{ field: 'createdAt', direction: 'desc' }],
        maxFields: 3,
        tieBreaker: { field: 'id', direction: 'asc' },
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects more than max sort fields', () => {
    expect(() =>
      parseSort('createdAt,email,id', {
        allowed: ALLOWED,
        default: [{ field: 'createdAt', direction: 'desc' }],
        maxFields: 2,
        tieBreaker: { field: 'id', direction: 'asc' },
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects duplicate sort fields', () => {
    expect(() =>
      parseSort('createdAt,-createdAt', {
        allowed: ALLOWED,
        default: [{ field: 'createdAt', direction: 'desc' }],
        maxFields: 3,
        tieBreaker: { field: 'id', direction: 'asc' },
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects non-string sort inputs (e.g. repeated query params)', () => {
    expect(() =>
      parseSort(['createdAt'] as unknown, {
        allowed: ALLOWED,
        default: [{ field: 'createdAt', direction: 'desc' }],
        maxFields: 3,
        tieBreaker: { field: 'id', direction: 'asc' },
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('ignores empty sort tokens and trims whitespace', () => {
    const res = parseSort('  , -createdAt ,  ', {
      allowed: ALLOWED,
      default: [{ field: 'createdAt', direction: 'asc' }],
      maxFields: 3,
      tieBreaker: { field: 'id', direction: 'asc' },
    });

    expect(res.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ]);
  });
});
