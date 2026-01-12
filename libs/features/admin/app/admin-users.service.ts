import type { ListQuery } from '../../../shared/list-query';
import type { AdminUsersRepository } from './ports/admin-users.repository';
import type { SetUserRoleInput } from './ports/admin-users.repository';
import type { SetUserStatusInput } from './ports/admin-users.repository';
import type {
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
} from './admin-users.types';
import { AdminError } from './admin.errors';
import { AdminErrorCode } from './admin.error-codes';

export class AdminUsersService {
  constructor(private readonly users: AdminUsersRepository) {}

  async listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult> {
    return this.users.listUsers(query);
  }

  async setUserRole(input: SetUserRoleInput) {
    const res = await this.users.setUserRole(input);

    if (res.kind === 'not_found') {
      throw new AdminError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (res.kind === 'last_admin') {
      throw new AdminError({
        status: 409,
        code: AdminErrorCode.ADMIN_CANNOT_DEMOTE_LAST_ADMIN,
        message: 'Cannot demote the last admin',
      });
    }

    return res.user;
  }

  async setUserStatus(input: SetUserStatusInput) {
    const res = await this.users.setUserStatus(input);

    if (res.kind === 'not_found') {
      throw new AdminError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (res.kind === 'last_admin') {
      throw new AdminError({
        status: 409,
        code: AdminErrorCode.ADMIN_CANNOT_SUSPEND_LAST_ADMIN,
        message: 'Cannot suspend the last admin',
      });
    }

    return res.user;
  }
}
