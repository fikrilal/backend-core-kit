import { getOrCreateRequestId, normalizeRequestId } from './request-id';

describe('request-id', () => {
  it('normalizes a valid request id', () => {
    expect(normalizeRequestId(' req-1 ')).toBe('req-1');
    expect(normalizeRequestId(['req-2'])).toBe('req-2');
  });

  it('rejects invalid characters', () => {
    expect(normalizeRequestId('bad id')).toBeUndefined();
    expect(normalizeRequestId('bad:id')).toBeUndefined();
    expect(normalizeRequestId('')).toBeUndefined();
  });

  it('rejects overly long ids', () => {
    expect(normalizeRequestId('a'.repeat(129))).toBeUndefined();
  });

  it('falls back to existing id when header is invalid', () => {
    expect(
      getOrCreateRequestId({
        headerValue: 'bad id',
        existingRequestId: 'req-existing',
      }),
    ).toBe('req-existing');
  });

  it('generates a UUID when no valid ids exist', () => {
    const id = getOrCreateRequestId({ headerValue: 'bad id' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(id).toBeDefined();
  });

  // Note: we do not mock `crypto.randomUUID` here; the important invariant is that the fallback is a UUID.
});
