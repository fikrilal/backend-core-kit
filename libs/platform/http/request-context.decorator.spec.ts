import type { FastifyRequest } from 'fastify';
import {
  getClientContext,
  getRequestTraceId,
  normalizeUserAgent,
} from './request-context.decorator';

function makeRequest(input: {
  ip?: string;
  headers?: Record<string, unknown>;
  requestId?: string;
  id?: string;
}): FastifyRequest {
  return {
    ip: input.ip ?? '127.0.0.1',
    headers: input.headers ?? {},
    requestId: input.requestId,
    id: input.id,
  } as unknown as FastifyRequest;
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

      expect(getClientContext(req)).toEqual({
        ip: '10.0.0.5',
        userAgent: 'my-agent',
      });
    });

    it('returns only ip when user-agent is missing', () => {
      const req = makeRequest({ ip: '10.0.0.6', headers: {} });
      expect(getClientContext(req)).toEqual({ ip: '10.0.0.6' });
    });
  });

  describe('getRequestTraceId', () => {
    it('prefers existing requestId and keeps request/id in sync', () => {
      const req = makeRequest({ requestId: 'req_existing' });

      expect(getRequestTraceId(req)).toBe('req_existing');
      expect(req.requestId).toBe('req_existing');
      expect(req.id).toBe('req_existing');
    });

    it('uses x-request-id header when requestId is absent', () => {
      const req = makeRequest({ headers: { 'x-request-id': 'req_from_header' } });

      expect(getRequestTraceId(req)).toBe('req_from_header');
      expect(req.requestId).toBe('req_from_header');
      expect(req.id).toBe('req_from_header');
    });

    it('falls back to existing id when requestId/header are absent', () => {
      const req = makeRequest({ id: 'req_from_id' });

      expect(getRequestTraceId(req)).toBe('req_from_id');
      expect(req.requestId).toBe('req_from_id');
      expect(req.id).toBe('req_from_id');
    });
  });
});
