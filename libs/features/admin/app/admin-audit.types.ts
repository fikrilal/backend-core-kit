import type { AdminUserRole } from './admin-users.types';

export type AdminUserRoleChangeAuditsSortField = 'createdAt' | 'id';

export type AdminUserRoleChangeAuditsFilterField =
  | 'actorUserId'
  | 'targetUserId'
  | 'oldRole'
  | 'newRole'
  | 'createdAt'
  | 'traceId';

export type AdminUserRoleChangeAuditListItem = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  oldRole: AdminUserRole;
  newRole: AdminUserRole;
  traceId: string;
  createdAt: string;
}>;

export type AdminUserRoleChangeAuditListResult = Readonly<{
  items: ReadonlyArray<AdminUserRoleChangeAuditListItem>;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}>;
