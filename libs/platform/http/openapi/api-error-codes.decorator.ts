import { applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { ErrorCode } from '../errors/error-codes';

export function ApiErrorCodes(codes: readonly ErrorCode[]) {
  return applyDecorators(ApiExtension('x-error-codes', codes));
}

