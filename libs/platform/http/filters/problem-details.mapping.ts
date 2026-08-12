import { HttpStatus } from '@nestjs/common';
import type { AppErrorCode } from '../../../shared/app-error-codes';
import { ErrorCode } from '../errors/error-codes';

export type ProblemTitleStrategy = 'validation-only' | 'status-default';

export function statusTitle(status: number): string {
  const map: Readonly<Record<number, string>> = {
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
  return map[status] ?? (status >= 500 ? 'Internal Server Error' : 'Error');
}

export function defaultProblemCode(status: number): ErrorCode {
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

export function resolveProblemTitle(params: {
  status: number;
  code: AppErrorCode;
  strategy: ProblemTitleStrategy;
}): string | undefined {
  if (params.code === ErrorCode.VALIDATION_FAILED) return 'Validation Failed';
  if (params.strategy === 'validation-only') return undefined;
  return statusTitle(params.status);
}
