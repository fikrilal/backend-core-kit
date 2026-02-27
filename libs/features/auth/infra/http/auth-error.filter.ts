import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  applyRetryAfterHeader,
  mapFeatureErrorToProblem,
} from '../../../../platform/http/filters/feature-error.mapper';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { AuthError } from '../../app/auth.errors';

@Catch(AuthError)
export class AuthErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: AuthError, host: ArgumentsHost): void {
    applyRetryAfterHeader(host, exception.retryAfterSeconds);

    const mapped = mapFeatureErrorToProblem({
      status: exception.status,
      code: exception.code,
      detail: exception.message,
      issues: exception.issues,
      titleStrategy: 'validation-only',
    });

    this.problemDetailsFilter.catch(mapped, host);
  }
}
