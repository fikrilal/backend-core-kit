import { decodeCursorV1, encodeCursorV1 } from './cursor';
import { ListQueryValidationError } from './errors';

const SORT_ALLOWED = {
  createdAt: { type: 'datetime' },
  id: { type: 'uuid' },
} as const;

const UUID = '11111111-1111-4111-8111-111111111111';

describe('cursor v1 codec', () => {
  it('round-trips and validates required fields', () => {
    const payload = {
      v: 1 as const,
      sort: '-createdAt,id',
      after: { createdAt: '2026-01-01T00:00:00.000Z', id: UUID },
    };

    const encoded = encodeCursorV1(payload);
    const decoded = decodeCursorV1(encoded, {
      expectedSort: '-createdAt,id',
      sortFields: ['createdAt', 'id'],
      allowed: SORT_ALLOWED,
    });

    expect(decoded.v).toBe(1);
    expect(decoded.sort).toBe('-createdAt,id');
    // datetime is normalized to ISO by the decoder
    expect(decoded.after.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(decoded.after.id).toBe(UUID);
  });

  it('rejects sort mismatch', () => {
    const encoded = encodeCursorV1({
      v: 1 as const,
      sort: '-createdAt,id',
      after: { createdAt: '2026-01-01T00:00:00.000Z', id: UUID },
    });

    expect(() =>
      decodeCursorV1(encoded, {
        expectedSort: 'createdAt,id',
        sortFields: ['createdAt', 'id'],
        allowed: SORT_ALLOWED,
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects missing required after fields', () => {
    const encoded = encodeCursorV1({
      v: 1 as const,
      sort: '-createdAt,id',
      after: { createdAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(() =>
      decodeCursorV1(encoded, {
        expectedSort: '-createdAt,id',
        sortFields: ['createdAt', 'id'],
        allowed: SORT_ALLOWED,
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects invalid encoding and invalid JSON', () => {
    expect(() =>
      decodeCursorV1('%%%not-base64%%%', {
        expectedSort: '-createdAt,id',
        sortFields: ['createdAt', 'id'],
        allowed: SORT_ALLOWED,
      }),
    ).toThrow(ListQueryValidationError);

    const invalidJson = Buffer.from('not-json', 'utf8').toString('base64url');
    expect(() =>
      decodeCursorV1(invalidJson, {
        expectedSort: '-createdAt,id',
        sortFields: ['createdAt', 'id'],
        allowed: SORT_ALLOWED,
      }),
    ).toThrow(ListQueryValidationError);
  });

  it('rejects unsupported fields and invalid field values in "after"', () => {
    const encoded = encodeCursorV1({
      v: 1 as const,
      sort: '-createdAt,id',
      after: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'not-a-uuid',
        unknown: 'x',
      },
    });

    expect(() =>
      decodeCursorV1(encoded, {
        expectedSort: '-createdAt,id',
        sortFields: ['createdAt', 'id'],
        allowed: SORT_ALLOWED,
      }),
    ).toThrow(ListQueryValidationError);
  });
});
