import {
  getClientContext,
  getRequestTraceId,
  normalizeUserAgent,
} from './request-context.decorator';

type RequestLike = {
  ip?: string;
  headers?: Record<string, unknown>;
  requestId?: string;
  id?: string;
};

function makeRequest(input: RequestLike): RequestLike {
  return {
    ip: input.ip ?? '127.0.0.1',
    headers: input.headers ?? {},
    requestId: input.requestId,
    id: input.id,
  };
}

function readClientContext(req: RequestLike) {
  return Reflect.apply(getClientContext, undefined, [req]);
}

function readRequestTraceId(req: RequestLike): string {
  const traceId = Reflect.apply(getRequestTraceId, undefined, [req]);
  if (typeof traceId !== 'string') {
    throw new Error('Expected string trace id');
  }
  return traceId;
}

describe('request-context.decorator helpers', () => {
  describe('normalizeUserAgent', () => {
    it('returns undefined for non-string values and empty strings', () => {
      expect(normalizeUserAgent(undefined)).toBeUndefined();
      expect(normalizeUserAgent('   ')).toBeUndefined();
      expect(normalizeUserAgent(['   '])).toBeUndefined();
      expect(normalizeUserAgent(['ua', 'ignored'])).toBe('ua');
    });

    it('trims and truncates user-agent values', () => {
      expect(normalizeUserAgent('  Mozilla/5.0  ')).toBe('Mozilla/5.0');

      const tooLong = `ua-${'x'.repeat(700)}`;
      const normalized = normalizeUserAgent(tooLong);
      expect(normalized).toBeDefined();
      expect(normalized?.length).toBe(512);
    });
  });

  describe('getClientContext', () => {
    it('returns ip and normalized user agent when present', () => {
      const req = makeRequest({
        ip: '10.0.0.5',
        headers: { 'user-agent': '  my-agent  ' },
      });

      expect(readClientContext(req)).toEqual({
        ip: '10.0.0.5',
        userAgent: 'my-agent',
      });
    });

    it('returns only ip when user-agent is missing', () => {
      const req = makeRequest({ ip: '10.0.0.6', headers: {} });
      expect(readClientContext(req)).toEqual({ ip: '10.0.0.6' });
    });
  });

  describe('getRequestTraceId', () => {
    it('prefers existing requestId and keeps request/id in sync', () => {
      const req = makeRequest({ requestId: 'req_existing' });

      expect(readRequestTraceId(req)).toBe('req_existing');
      expect(req.requestId).toBe('req_existing');
      expect(req.id).toBe('req_existing');
    });

    it('uses x-request-id header when requestId is absent', () => {
      const req = makeRequest({ headers: { 'x-request-id': 'req_from_header' } });

      expect(readRequestTraceId(req)).toBe('req_from_header');
      expect(req.requestId).toBe('req_from_header');
      expect(req.id).toBe('req_from_header');
    });

    it('falls back to existing id when requestId/header are absent', () => {
      const req = makeRequest({ id: 'req_from_id' });

      expect(readRequestTraceId(req)).toBe('req_from_id');
      expect(req.requestId).toBe('req_from_id');
      expect(req.id).toBe('req_from_id');
    });
  });
});
