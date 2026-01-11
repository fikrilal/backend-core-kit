export type AdminUsersSortField = 'createdAt' | 'email' | 'id';

export type AdminUsersFilterField = 'role' | 'emailVerified' | 'createdAt' | 'email';

export type AdminUserListItem = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<string>;
  createdAt: string;
}>;

export type AdminUsersListResult = Readonly<{
  items: ReadonlyArray<AdminUserListItem>;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}>;
