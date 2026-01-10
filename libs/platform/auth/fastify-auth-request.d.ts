import 'fastify';
import type { AuthPrincipal } from './auth.types';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
}
