import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { AuthError } from '../../app/auth.errors';

@Catch(AuthError)
export class AuthErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: AuthError, host: ArgumentsHost): void {
    const mapped = new ProblemException(exception.status, {
      title: exception.code === ErrorCode.VALIDATION_FAILED ? 'Validation Failed' : undefined,
      detail: exception.message,
      code: exception.code,
      errors: exception.issues ? [...exception.issues] : undefined,
    });

    this.problemDetailsFilter.catch(mapped, host);
  }
}

