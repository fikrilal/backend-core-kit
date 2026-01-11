import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUsersFilterField,
  AdminUserRole,
  AdminUserListItem,
  AdminUsersListResult,
  AdminUsersSortField,
} from '../admin-users.types';

export type SetUserRoleResult =
  | Readonly<{ kind: 'ok'; user: AdminUserListItem }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'last_admin' }>;

export interface AdminUsersRepository {
  listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult>;

  setUserRole(userId: string, role: AdminUserRole): Promise<SetUserRoleResult>;
}
