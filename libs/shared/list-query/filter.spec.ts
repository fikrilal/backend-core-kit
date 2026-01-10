import { ListQueryValidationError } from './errors';
import { parseFilters } from './filter';

const FILTERS = {
  status: { type: 'enum', ops: ['eq', 'in'], enumValues: ['ACTIVE', 'SUSPENDED'] },
  createdAt: { type: 'datetime', ops: ['gte', 'lte'] },
  isActive: { type: 'boolean', ops: ['eq'] },
} as const;

describe('parseFilters', () => {
  it('parses nested filter object (qs-style)', () => {
    const res = parseFilters(
      {
        status: { in: 'ACTIVE,SUSPENDED' },
        createdAt: { gte: '2026-01-01T00:00:00.000Z' },
        isActive: 'true',
      },
      FILTERS,
    );

    expect(res).toEqual([
      { field: 'status', op: 'in', value: ['ACTIVE', 'SUSPENDED'] },
      { field: 'createdAt', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
      { field: 'isActive', op: 'eq', value: true },
    ]);
  });

  it('parses bracketed keys (legacy)', () => {
    const res = parseFilters(
      {
        'filter[status]': 'ACTIVE',
        'filter[createdAt][lte]': '2026-01-31T23:59:59.999Z',
      },
      FILTERS,
    );

    expect(res).toEqual([
      { field: 'status', op: 'eq', value: 'ACTIVE' },
      { field: 'createdAt', op: 'lte', value: '2026-01-31T23:59:59.999Z' },
    ]);
  });

  it('rejects unsupported fields', () => {
    expect(() => parseFilters({ unknown: 'x' }, FILTERS)).toThrow(ListQueryValidationError);
  });

  it('rejects invalid enum values', () => {
    expect(() => parseFilters({ status: 'NOPE' }, FILTERS)).toThrow(ListQueryValidationError);
  });
});
