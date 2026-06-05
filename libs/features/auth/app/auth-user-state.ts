import { ErrorCode } from '../../../shared/error-codes';
import { AuthError } from './auth.errors';
import type { AuthRepository } from './ports/auth.repository';

export async function assertAuthUserIsActive(repo: AuthRepository, userId: string): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user || user.status === 'DELETED') {
    throw new AuthError({ status: 401, code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
  }
}
