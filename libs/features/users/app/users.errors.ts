import type { ErrorCode } from '../../../shared/error-codes';
import type { UsersErrorCode } from './users.error-codes';

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
  }
}

export type UsersIssue = Readonly<{ field?: string; message: string }>;

export type UsersErrorCodeValue = UsersErrorCode | ErrorCode;

export class UsersError extends Error {
  readonly status: number;
  readonly code: UsersErrorCodeValue;
  readonly issues?: ReadonlyArray<UsersIssue>;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    status: number;
    code: UsersErrorCodeValue;
    message?: string;
    issues?: ReadonlyArray<UsersIssue>;
    retryAfterSeconds?: number;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}
