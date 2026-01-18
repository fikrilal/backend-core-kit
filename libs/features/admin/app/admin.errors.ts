import type { ErrorCode } from '../../../shared/error-codes';
import type { AdminErrorCode } from './admin.error-codes';

export type AdminIssue = Readonly<{ field?: string; message: string }>;

export type AdminErrorCodeValue = AdminErrorCode | ErrorCode;

export class AdminError extends Error {
  readonly status: number;
  readonly code: AdminErrorCodeValue;
  readonly issues?: ReadonlyArray<AdminIssue>;

  constructor(params: {
    status: number;
    code: AdminErrorCodeValue;
    message?: string;
    issues?: ReadonlyArray<AdminIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}
