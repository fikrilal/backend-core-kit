export type UserRole = 'USER' | 'ADMIN';

export type UserRecord = Readonly<{
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
}>;

export type MeView = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<UserRole>;
}>;
