import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUsersFilterField,
  AdminUserRole,
  AdminUserStatus,
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

export type SetUserStatusInput = Readonly<{
  actorUserId: string;
  actorSessionId: string;
  traceId: string;
  targetUserId: string;
  status: AdminUserStatus;
  reason?: string | null;
  now: Date;
}>;

export type SetUserStatusResult =
  | Readonly<{ kind: 'ok'; user: AdminUserListItem }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'last_admin' }>;

export interface AdminUsersRepository {
  listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult>;

  setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult>;

  setUserStatus(input: SetUserStatusInput): Promise<SetUserStatusResult>;
}
