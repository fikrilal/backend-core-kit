import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { AdminError } from '../../app/admin.errors';

@Catch(AdminError)
export class AdminErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: AdminError, host: ArgumentsHost): void {
    const mapped = new ProblemException(exception.status, {
      title: this.titleForStatus(exception.status, exception.code),
      detail: exception.message,
      code: exception.code,
      errors: exception.issues ? [...exception.issues] : undefined,
    });

    this.problemDetailsFilter.catch(mapped, host);
  }

  private titleForStatus(status: number, code: string): string {
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
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
