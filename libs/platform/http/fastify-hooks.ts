import { randomUUID } from 'crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';

function stripQueryString(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

function getOrCreateRequestId(req: FastifyRequest): string {
  const header = req.headers['x-request-id'];
  const incoming = Array.isArray(header) ? header[0] : header;
  const fromHeader =
    typeof incoming === 'string' && incoming.trim() !== '' ? incoming.trim() : undefined;
  const existing =
    typeof req.requestId === 'string' && req.requestId.trim() !== '' ? req.requestId : undefined;
  const existingId = typeof req.id === 'string' && req.id.trim() !== '' ? req.id : undefined;
  const requestId = fromHeader ?? existing ?? existingId ?? randomUUID();

  req.requestId = requestId;
  req.id = requestId;
  return requestId;
}

export function registerFastifyHttpPlatform(app: NestFastifyApplication) {
  const fastify: FastifyInstance = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', async (req, reply) => {
    const requestId = getOrCreateRequestId(req);
    reply.header('X-Request-Id', requestId);

    // Keep the Node raw request in sync (nestjs-pino uses the raw IncomingMessage in serializers).
    const raw = req.raw as unknown as { id?: string; requestId?: string };
    raw.requestId = requestId;
    raw.id = requestId;

    // Trace correlation + safe URL attributes (no querystrings).
    const span = otelTrace.getSpan(otelContext.active());
    if (span) {
      const path = stripQueryString(req.url);
      span.setAttribute('app.request_id', requestId);
      span.setAttribute('http.target', path);
      span.setAttribute('url.path', path);

      const hostHeader = req.headers.host;
      const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
      const proto =
        typeof req.protocol === 'string' && req.protocol.trim() !== '' ? req.protocol : 'http';
      if (typeof host === 'string' && host.trim() !== '') {
        const fullUrl = `${proto}://${host}${path}`;
        span.setAttribute('http.url', fullUrl);
        span.setAttribute('url.full', fullUrl);
      }
    }
  });
}
