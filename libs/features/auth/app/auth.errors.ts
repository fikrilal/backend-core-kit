import type { ErrorCode } from '../../../shared/error-codes';
import type { AuthErrorCode } from './auth.error-codes';

export type AuthErrorCodeValue = AuthErrorCode | ErrorCode;

export type AuthIssue = Readonly<{ field?: string; message: string }>;

export class AuthError extends Error {
  readonly status: number;
  readonly code: AuthErrorCodeValue;
  readonly issues?: ReadonlyArray<AuthIssue>;

  constructor(params: {
    status: number;
    code: AuthErrorCodeValue;
    message?: string;
    issues?: ReadonlyArray<AuthIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('Email already exists');
  }
}

export class ExternalIdentityAlreadyExistsError extends Error {
  constructor() {
    super('External identity already exists');
  }
}
