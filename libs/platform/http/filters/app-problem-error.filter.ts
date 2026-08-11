import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { AppProblemError } from '../errors/app-problem.error';
import { applyRetryAfterHeader, mapFeatureErrorToProblem } from './feature-error.mapper';
import { ProblemDetailsFilter } from './problem-details.filter';

@Catch(AppProblemError)
export class AppProblemErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: AppProblemError, host: ArgumentsHost): void {
    applyRetryAfterHeader(host, exception.retryAfterSeconds);

    const mapped = mapFeatureErrorToProblem({
      status: exception.status,
      code: exception.code,
      detail: exception.message,
      issues: exception.issues,
      titleStrategy: exception.titleStrategy,
    });

    this.problemDetailsFilter.catch(mapped, host);
  }
}
