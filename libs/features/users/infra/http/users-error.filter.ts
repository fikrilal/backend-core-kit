import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import {
  applyRetryAfterHeader,
  mapFeatureErrorToProblem,
} from '../../../../platform/http/filters/feature-error.mapper';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { UserNotFoundError, UsersError } from '../../app/users.errors';

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

    applyRetryAfterHeader(host, exception.retryAfterSeconds);

    const mapped = mapFeatureErrorToProblem({
      status: exception.status,
      code: exception.code,
      detail: exception.message,
      issues: exception.issues,
      titleStrategy: 'status-default',
    });

    this.problemDetailsFilter.catch(mapped, host);
  }
}
