import { buildCursorAfterWhere } from './cursor-after';

describe('buildCursorAfterWhere', () => {
  it('builds lexicographic after-where for admin users sort fields', () => {
    const where = buildCursorAfterWhere({
      sort: [
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ] as const,
      after: {
        createdAt: '2026-02-26T00:00:00.000Z',
        id: 'user_2',
      },
      builders: {
        equals: (field, value) =>
          field === 'createdAt'
            ? { createdAt: { equals: new Date(value as string) } }
            : { id: { equals: String(value) } },
        compare: (field, direction, value) => {
          if (field === 'createdAt') {
            const date = new Date(value as string);
            return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
          }
          return direction === 'asc'
            ? { id: { gt: String(value) } }
            : { id: { lt: String(value) } };
        },
        and: (clauses) => ({ AND: clauses }),
        or: (clauses) => ({ OR: clauses }),
        empty: () => ({}),
      },
    });

    expect(where).toEqual({
      OR: [
        { AND: [{ createdAt: { lt: new Date('2026-02-26T00:00:00.000Z') } }] },
        {
          AND: [
            { createdAt: { equals: new Date('2026-02-26T00:00:00.000Z') } },
            { id: { gt: 'user_2' } },
          ],
        },
      ],
    });
  });

  it('builds where for admin audit fields with equality prefix', () => {
    const where = buildCursorAfterWhere({
      sort: [
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'desc' },
      ] as const,
      after: {
        createdAt: '2026-02-26T01:00:00.000Z',
        id: 'audit_9',
      },
      builders: {
        equals: (field, value) =>
          field === 'createdAt'
            ? { createdAt: { equals: new Date(value as string) } }
            : { id: { equals: String(value) } },
        compare: (field, direction, value) => {
          if (field === 'createdAt') {
            const date = new Date(value as string);
            return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
          }
          return direction === 'asc'
            ? { id: { gt: String(value) } }
            : { id: { lt: String(value) } };
        },
        and: (clauses) => ({ AND: clauses }),
        or: (clauses) => ({ OR: clauses }),
        empty: () => ({}),
      },
    });

    expect(where).toEqual({
      OR: [
        { AND: [{ createdAt: { lt: new Date('2026-02-26T01:00:00.000Z') } }] },
        {
          AND: [
            { createdAt: { equals: new Date('2026-02-26T01:00:00.000Z') } },
            { id: { lt: 'audit_9' } },
          ],
        },
      ],
    });
  });

  it('builds where for auth session fields with ascending sort', () => {
    const where = buildCursorAfterWhere({
      sort: [
        { field: 'createdAt', direction: 'asc' },
        { field: 'id', direction: 'asc' },
      ] as const,
      after: {
        createdAt: '2026-02-26T02:00:00.000Z',
        id: 'session_3',
      },
      builders: {
        equals: (field, value) =>
          field === 'createdAt'
            ? { createdAt: { equals: new Date(value as string) } }
            : { id: { equals: String(value) } },
        compare: (field, direction, value) => {
          if (field === 'createdAt') {
            const date = new Date(value as string);
            return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
          }
          return direction === 'asc'
            ? { id: { gt: String(value) } }
            : { id: { lt: String(value) } };
        },
        and: (clauses) => ({ AND: clauses }),
        or: (clauses) => ({ OR: clauses }),
        empty: () => ({}),
      },
    });

    expect(where).toEqual({
      OR: [
        { AND: [{ createdAt: { gt: new Date('2026-02-26T02:00:00.000Z') } }] },
        {
          AND: [
            { createdAt: { equals: new Date('2026-02-26T02:00:00.000Z') } },
            { id: { gt: 'session_3' } },
          ],
        },
      ],
    });
  });

  it('throws when a cursor value is missing for a sort field', () => {
    expect(() =>
      buildCursorAfterWhere({
        sort: [
          { field: 'createdAt', direction: 'asc' },
          { field: 'id', direction: 'asc' },
        ] as const,
        after: { createdAt: '2026-02-26T03:00:00.000Z' },
        builders: {
          equals: () => ({}),
          compare: () => ({}),
          and: (clauses) => ({ AND: clauses }),
          or: (clauses) => ({ OR: clauses }),
          empty: () => ({}),
        },
      }),
    ).toThrow('Cursor missing value for sort field "id"');
  });
});
