import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class ProblemException extends HttpException {
  constructor(
    status: number,
    options: {
      title?: string;
      detail?: string;
      code?: ErrorCode | string;
      type?: string;
      errors?: Array<{ field?: string; message: string }>;
    } = {},
  ) {
    const { title, detail, code, type, errors } = options;
    super({ title, detail, code, type, errors }, status);
  }

  static notFound(detail?: string) {
    return new ProblemException(404, { title: 'Not Found', detail, code: ErrorCode.NOT_FOUND });
  }

  static conflict(detail?: string, code: ErrorCode | string = ErrorCode.CONFLICT) {
    return new ProblemException(409, { title: 'Conflict', detail, code });
  }

  static unauthorized(detail?: string) {
    return new ProblemException(401, { title: 'Unauthorized', detail, code: ErrorCode.UNAUTHORIZED });
  }

  static forbidden(detail?: string) {
    return new ProblemException(403, { title: 'Forbidden', detail, code: ErrorCode.FORBIDDEN });
  }

  static rateLimited(detail?: string) {
    return new ProblemException(429, {
      title: 'Too Many Requests',
      detail,
      code: ErrorCode.RATE_LIMITED,
    });
  }

  static internal(detail?: string) {
    return new ProblemException(500, {
      title: 'Internal Server Error',
      detail,
      code: ErrorCode.INTERNAL,
    });
  }
}

