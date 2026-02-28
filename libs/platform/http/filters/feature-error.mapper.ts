import type { ArgumentsHost } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ErrorCode } from '../errors/error-codes';
import { ProblemException } from '../errors/problem.exception';

export type FeatureErrorIssue = Readonly<{ field?: string; message: string }>;

export type FeatureErrorTitleStrategy = 'validation-only' | 'status-default';

type MapFeatureErrorToProblemParams = Readonly<{
  status: number;
  code: ErrorCode | string;
  detail?: string;
  issues?: ReadonlyArray<FeatureErrorIssue>;
  titleStrategy: FeatureErrorTitleStrategy;
}>;

function isPositiveRetryAfter(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function statusTitle(status: number): string {
  switch (status) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 501:
      return 'Not Implemented';
    default:
      return status >= 500 ? 'Internal Server Error' : 'Error';
  }
}

function resolveTitle(params: {
  status: number;
  code: ErrorCode | string;
  strategy: FeatureErrorTitleStrategy;
}): string | undefined {
  if (params.code === ErrorCode.VALIDATION_FAILED) return 'Validation Failed';
  if (params.strategy === 'validation-only') return undefined;
  return statusTitle(params.status);
}

export function mapFeatureErrorToProblem(params: MapFeatureErrorToProblemParams): ProblemException {
  return new ProblemException(params.status, {
    title: resolveTitle({
      status: params.status,
      code: params.code,
      strategy: params.titleStrategy,
    }),
    detail: params.detail,
    code: params.code,
    errors: params.issues ? [...params.issues] : undefined,
  });
}

export function applyRetryAfterHeader(host: ArgumentsHost, retryAfterSeconds: unknown): void {
  if (!isPositiveRetryAfter(retryAfterSeconds)) return;
  host.switchToHttp().getResponse<FastifyReply>().header('Retry-After', String(retryAfterSeconds));
}
