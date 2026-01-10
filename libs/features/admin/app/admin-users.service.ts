import type { ListQuery } from '../../../shared/list-query';
import type { AdminUsersRepository } from './ports/admin-users.repository';
import type {
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
} from './admin-users.types';

export class AdminUsersService {
  constructor(private readonly users: AdminUsersRepository) {}

  async listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult> {
    return this.users.listUsers(query);
  }
}
