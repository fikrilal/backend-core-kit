import { applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { AppErrorCode } from '../../../shared/app-error-codes';

export function ApiErrorCodes(codes: ReadonlyArray<AppErrorCode>) {
  return applyDecorators(ApiExtension('x-error-codes', codes));
}
