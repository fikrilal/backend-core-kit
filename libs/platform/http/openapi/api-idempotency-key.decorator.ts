import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export function ApiIdempotencyKeyHeader(options: { required?: boolean } = {}): MethodDecorator {
  const required = options.required ?? false;
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required,
      description:
        'Idempotency key for safe retries of write requests. Replays return `Idempotency-Replayed: true`.',
      schema: { type: 'string', format: 'uuid' },
    }),
  );
}
