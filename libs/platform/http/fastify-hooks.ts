import { randomUUID } from 'crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';

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
  });
}
