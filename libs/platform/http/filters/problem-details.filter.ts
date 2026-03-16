import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { ErrorCode } from '../errors/error-codes';
import type { AppErrorCode } from '../../../shared/app-error-codes';
import { isAppErrorCode } from '../../../shared/app-error-codes';

type ProblemValidationError = Readonly<{ field?: string; message: string }>;

type ProblemResponseShape = Readonly<{
  title?: string;
  message?: string | string[];
  detail?: string;
  code?: unknown;
  type?: string;
  errors?: Array<ProblemValidationError>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function isProblemValidationError(value: unknown): value is ProblemValidationError {
  if (!isRecord(value)) return false;
  if (typeof value.message !== 'string') return false;
  return value.field === undefined || typeof value.field === 'string';
}

function parseProblemResponseShape(value: unknown): ProblemResponseShape | undefined {
  if (!isRecord(value)) return undefined;

  const title = typeof value.title === 'string' ? value.title : undefined;
  const detail = typeof value.detail === 'string' ? value.detail : undefined;
  const type = typeof value.type === 'string' ? value.type : undefined;
  const code = value.code;
  const message =
    typeof value.message === 'string'
      ? value.message
      : Array.isArray(value.message) && value.message.every((item) => typeof item === 'string')
        ? value.message
        : undefined;
  const errors =
    Array.isArray(value.errors) && value.errors.every(isProblemValidationError)
      ? value.errors
      : undefined;

  return { title, message, detail, code, type, errors };
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const traceId: string | undefined =
      req.requestId || req.id || getHeaderValue(req.headers['x-request-id']);
    const otelTraceId = otelTrace.getSpan(otelContext.active())?.spanContext().traceId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let code: AppErrorCode | undefined;
    let type = 'about:blank';
    let errors: Array<{ field?: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();

      if (typeof resp === 'string') {
        title = resp;
      } else if (isRecord(resp)) {
        const r = parseProblemResponseShape(resp);
        if (!r) {
          title = this.statusTitle(status);
        } else {
          title = r.title ?? this.statusTitle(status);

          if (Array.isArray(r.message)) {
            // Nest validation can return message arrays; map to a single detail string.
            detail = r.message.join('; ');
          } else {
            detail = r.detail ?? (typeof r.message === 'string' ? r.message : undefined);
          }

          if (isAppErrorCode(r.code)) {
            code = r.code;
          }
          type = r.type ?? type;
          errors = r.errors ?? errors;
        }
      } else {
        title = this.statusTitle(status);
      }
    }

    if (!code) {
      code = this.defaultCode(status);
    }

    const problem: Record<string, unknown> = {
      type,
      title,
      status,
      ...(detail ? { detail } : {}),
      ...(errors && errors.length ? { errors } : {}),
      code,
      ...(traceId ? { traceId } : {}),
      ...(otelTraceId ? { otelTraceId } : {}),
    };

    reply.header('X-Request-Id', traceId ?? '');
    reply.header('Content-Type', 'application/problem+json');
    reply.status(status).send(problem);
  }

  private defaultCode(status: number): ErrorCode {
    if (status >= 500) return ErrorCode.INTERNAL;

    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.VALIDATION_FAILED;
    }
  }

  private statusTitle(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.NOT_IMPLEMENTED]: 'Not Implemented',
      [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
      [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
    };
    return map[status] ?? 'Error';
  }
}
