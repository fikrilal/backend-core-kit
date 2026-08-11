import type { AppErrorCode } from '../../../shared/app-error-codes';

export type AppProblemIssue = Readonly<{ field?: string; message: string }>;

export type AppProblemTitleStrategy = 'validation-only' | 'status-default';

export class AppProblemError extends Error {
  readonly status: number;
  readonly code: AppErrorCode;
  readonly issues?: ReadonlyArray<AppProblemIssue>;
  readonly retryAfterSeconds?: number;
  readonly titleStrategy: AppProblemTitleStrategy;

  constructor(params: {
    status: number;
    code: AppErrorCode;
    message?: string;
    issues?: ReadonlyArray<AppProblemIssue>;
    retryAfterSeconds?: number;
    titleStrategy?: AppProblemTitleStrategy;
  }) {
    super(params.message ?? params.code);
    this.name = 'AppProblemError';
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.titleStrategy = params.titleStrategy ?? 'status-default';
  }
}
