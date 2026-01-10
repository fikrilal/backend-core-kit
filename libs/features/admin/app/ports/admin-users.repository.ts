import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
} from '../admin-users.types';

export interface AdminUsersRepository {
  listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult>;
}
