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

  it('rejects non-ISO datetime values', () => {
    expect(() => parseFilters({ createdAt: { gte: '2026-01-01T00:00:00' } }, FILTERS)).toThrow(
      ListQueryValidationError,
    );
    expect(() => parseFilters({ createdAt: { gte: '2026-01-01 00:00:00Z' } }, FILTERS)).toThrow(
      ListQueryValidationError,
    );
  });

  it('accepts ISO datetime values with offsets and normalizes to UTC', () => {
    const res = parseFilters({ createdAt: { gte: '2026-01-01T00:00:00+07:00' } }, FILTERS);
    expect(res).toEqual([{ field: 'createdAt', op: 'gte', value: '2025-12-31T17:00:00.000Z' }]);
  });

  it('rejects filter when not an object', () => {
    expect(() => parseFilters('ACTIVE', FILTERS)).toThrow(ListQueryValidationError);
  });

  it('rejects unsupported operators', () => {
    expect(() => parseFilters({ status: { gte: 'ACTIVE' } }, FILTERS)).toThrow(
      ListQueryValidationError,
    );
    expect(() => parseFilters({ 'filter[status][gte]': 'ACTIVE' }, FILTERS)).toThrow(
      ListQueryValidationError,
    );
  });

  it('parses "in" lists while ignoring empty list items', () => {
    const res = parseFilters({ status: { in: 'ACTIVE,,SUSPENDED,' } }, FILTERS);
    expect(res).toEqual([{ field: 'status', op: 'in', value: ['ACTIVE', 'SUSPENDED'] }]);
  });

  it('rejects invalid values in "in" lists', () => {
    expect(() => parseFilters({ status: { in: 'ACTIVE,NOPE' } }, FILTERS)).toThrow(
      ListQueryValidationError,
    );
  });
});
