import { applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { ErrorCode } from '../errors/error-codes';

export function ApiErrorCodes(codes: ReadonlyArray<ErrorCode | string>) {
  return applyDecorators(ApiExtension('x-error-codes', codes));
}
