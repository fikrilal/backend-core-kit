import type { AdminErrorCode } from './admin/admin-error-codes';
import type { AuthErrorCode } from './auth/auth-error-codes';
import type { ErrorCode } from './error-codes';
import type { UsersErrorCode } from './users/users-error-codes';

export type AppErrorCode = ErrorCode | AuthErrorCode | UsersErrorCode | AdminErrorCode;
