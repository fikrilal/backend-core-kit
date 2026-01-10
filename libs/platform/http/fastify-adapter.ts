import { FastifyAdapter } from '@nestjs/platform-fastify';
import qs from 'qs';

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    routerOptions: {
      querystringParser: (str) =>
        qs.parse(str, {
          allowPrototypes: false,
          plainObjects: true,
          depth: 5,
          parameterLimit: 1000,
        }) as unknown as Record<string, unknown>,
    },
  });
}
