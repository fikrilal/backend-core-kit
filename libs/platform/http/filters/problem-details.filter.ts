import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import type { AppErrorCode } from '../../../shared/app-error-codes';
import { isAppErrorCode } from '../../../shared/app-error-codes';
import { getOrCreateRequestId } from '../request-id';
import { defaultProblemCode, statusTitle } from './problem-details.mapping';

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

    const traceId = getOrCreateRequestId({
      headerValue: req.headers['x-request-id'],
      existingRequestId: req.requestId,
      existingId: req.id,
    });
    req.requestId = traceId;
    req.id = traceId;
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
          title = statusTitle(status);
        } else {
          title = r.title ?? statusTitle(status);

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
        title = statusTitle(status);
      }
    }

    if (!code) {
      code = defaultProblemCode(status);
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

    reply.header('X-Request-Id', traceId);
    reply.header('Content-Type', 'application/problem+json');
    reply.status(status).send(problem);
  }
}
