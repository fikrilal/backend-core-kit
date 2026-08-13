export type AdminUsersSortField = 'createdAt' | 'email' | 'id';

export type AdminUsersFilterField = 'role' | 'emailVerified' | 'createdAt' | 'email';

export type AdminUserRole = 'USER' | 'ADMIN';

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type AdminUserMutableStatus = Exclude<AdminUserStatus, 'DELETED'>;

export type AdminUserListItem = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<AdminUserRole>;
  status: AdminUserStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
}>;

export type AdminUsersListResult = Readonly<{
  items: ReadonlyArray<AdminUserListItem>;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}>;

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

export type AdminUserAccountDeletionAuditsSortField = 'createdAt' | 'id';

export type AdminUserAccountDeletionAuditsFilterField =
  | 'actorUserId'
  | 'targetUserId'
  | 'action'
  | 'createdAt'
  | 'traceId';

export type AdminUserAccountDeletionAction =
  | 'REQUESTED'
  | 'CANCELED'
  | 'FINALIZED'
  | 'FINALIZE_BLOCKED_LAST_ADMIN';

export type AdminUserAccountDeletionAuditListItem = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  action: AdminUserAccountDeletionAction;
  traceId: string;
  createdAt: string;
}>;

export type AdminUserAccountDeletionAuditListResult = Readonly<{
  items: ReadonlyArray<AdminUserAccountDeletionAuditListItem>;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}>;
