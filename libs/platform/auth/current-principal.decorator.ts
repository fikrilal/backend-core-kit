import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import type { AuthPrincipal } from './auth.types';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const principal = req.principal;
    if (!principal) {
      throw new ProblemException(401, {
        title: 'Unauthorized',
        code: ErrorCode.UNAUTHORIZED,
      });
    }
    return principal;
  },
);
