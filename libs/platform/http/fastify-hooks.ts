import { randomUUID } from 'crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';

function getOrCreateRequestId(req: FastifyRequest): string {
  const header = req.headers['x-request-id'];
  const incoming = Array.isArray(header) ? header[0] : header;
  const requestId =
    typeof incoming === 'string' && incoming.trim() !== '' ? incoming.trim() : randomUUID();
  req.requestId = requestId;
  return requestId;
}

export function registerFastifyHttpPlatform(app: NestFastifyApplication) {
  const fastify: FastifyInstance = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', async (req, reply) => {
    const requestId = getOrCreateRequestId(req);
    reply.header('X-Request-Id', requestId);
  });
}
