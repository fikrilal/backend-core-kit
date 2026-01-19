import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import { AccessTokenInvalidError, AccessTokenVerifier } from './access-token-verifier.service';
import { IS_PUBLIC_KEY } from './public.decorator';

function getAuthorizationHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers['authorization'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const trimmed = authorization.trim();
  if (!trimmed) return undefined;

  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token.trim() || undefined;
}

function stripQueryString(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

function getTraceId(req: FastifyRequest): string | undefined {
  const fromRequest = req.requestId;
  if (typeof fromRequest === 'string' && fromRequest.trim() !== '') return fromRequest;

  const raw = req.headers['x-request-id'];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  return typeof fromHeader === 'string' && fromHeader.trim() !== '' ? fromHeader.trim() : undefined;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AccessTokenGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, cls]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearerToken(getAuthorizationHeader(req));
    if (!token) {
      throw new ProblemException(401, {
        title: 'Unauthorized',
        code: ErrorCode.UNAUTHORIZED,
      });
    }

    try {
      req.principal = await this.verifier.verifyAccessToken(token);
      return true;
    } catch (err: unknown) {
      if (err instanceof AccessTokenInvalidError) {
        throw new ProblemException(401, {
          title: 'Unauthorized',
          code: ErrorCode.UNAUTHORIZED,
        });
      }

      this.logger.error(
        {
          err,
          traceId: getTraceId(req),
          path: stripQueryString(req.url),
        },
        'Unexpected access token verification error',
      );
      throw new ProblemException(500, {
        title: 'Internal Server Error',
        code: ErrorCode.INTERNAL,
      });
    }
  }
}
