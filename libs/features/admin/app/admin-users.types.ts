export type AdminUsersSortField = 'createdAt' | 'email' | 'id';

export type AdminUsersFilterField = 'role' | 'emailVerified' | 'createdAt' | 'email';

export type AdminUserRole = 'USER' | 'ADMIN';

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type AdminUserMutableStatus = Exclude<AdminUserStatus, 'DELETED'>;

export type AdminUserListItem = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<string>;
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
