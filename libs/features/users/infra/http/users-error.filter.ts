import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { UserNotFoundError, UsersError, type UsersErrorCodeValue } from '../../app/users.errors';

@Catch(UserNotFoundError, UsersError)
export class UsersErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: UserNotFoundError | UsersError, host: ArgumentsHost): void {
    if (exception instanceof UserNotFoundError) {
      // Treat missing subject as an invalid principal (token is not usable).
      const mapped = new ProblemException(401, {
        title: 'Unauthorized',
        code: ErrorCode.UNAUTHORIZED,
      });
      this.problemDetailsFilter.catch(mapped, host);
      return;
    }

    if (
      exception.status === 429 &&
      typeof exception.retryAfterSeconds === 'number' &&
      Number.isInteger(exception.retryAfterSeconds) &&
      exception.retryAfterSeconds > 0
    ) {
      host
        .switchToHttp()
        .getResponse<FastifyReply>()
        .header('Retry-After', String(exception.retryAfterSeconds));
    }

    const mapped = new ProblemException(exception.status, {
      title: this.titleForStatus(exception.status, exception.code),
      detail: exception.message,
      code: exception.code,
      errors: exception.issues ? [...exception.issues] : undefined,
    });

    this.problemDetailsFilter.catch(mapped, host);
  }

  private titleForStatus(status: number, code: UsersErrorCodeValue): string {
    if (code === ErrorCode.VALIDATION_FAILED) return 'Validation Failed';

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
      case 429:
        return 'Too Many Requests';
      case 501:
        return 'Not Implemented';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
