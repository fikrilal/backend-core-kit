import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUsersFilterField,
  AdminUserRole,
  AdminUserListItem,
  AdminUsersListResult,
  AdminUsersSortField,
} from '../admin-users.types';

export type SetUserRoleInput = Readonly<{
  actorUserId: string;
  actorSessionId: string;
  traceId: string;
  targetUserId: string;
  role: AdminUserRole;
}>;

export type SetUserRoleResult =
  | Readonly<{ kind: 'ok'; user: AdminUserListItem }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'last_admin' }>;

export interface AdminUsersRepository {
  listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult>;

  setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult>;
}
