import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getOrCreateRequestId } from './request-id';

const SESSION_USER_AGENT_MAX_LENGTH = 512;

type RequestWithHeaders = Readonly<{
  headers: Readonly<Record<string, unknown>>;
}>;

export type ClientContextValue = Readonly<{
  ip: string;
  userAgent?: string;
}>;

function firstHeaderValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.length > 0 ? value[0] : undefined;
}

export function normalizeUserAgent(value: unknown): string | undefined {
  const raw = firstHeaderValue(value);
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  return trimmed.length <= SESSION_USER_AGENT_MAX_LENGTH
    ? trimmed
    : trimmed.slice(0, SESSION_USER_AGENT_MAX_LENGTH);
}

function getHeader(req: RequestWithHeaders, name: string): unknown {
  const key = name.toLowerCase();
  return req.headers[key];
}

export function getRequestTraceId(req: FastifyRequest): string {
  const traceId = getOrCreateRequestId({
    headerValue: getHeader(req, 'x-request-id'),
    existingRequestId: req.requestId,
    existingId: req.id,
  });
  req.requestId = traceId;
  req.id = traceId;
  return traceId;
}

export function getClientContext(req: FastifyRequest): ClientContextValue {
  const userAgent = normalizeUserAgent(getHeader(req, 'user-agent'));
  return userAgent ? { ip: req.ip, userAgent } : { ip: req.ip };
}

export const RequestTraceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return getRequestTraceId(req);
  },
);

export const ClientContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientContextValue => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return getClientContext(req);
  },
);
