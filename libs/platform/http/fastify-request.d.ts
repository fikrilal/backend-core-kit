import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    requestId?: string;
  }
}

