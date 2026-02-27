import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { mapFeatureErrorToProblem } from '../../../../platform/http/filters/feature-error.mapper';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { AdminError } from '../../app/admin.errors';

@Catch(AdminError)
export class AdminErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: AdminError, host: ArgumentsHost): void {
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
