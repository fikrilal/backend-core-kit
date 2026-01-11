import type { AuthMethod } from '../../../shared/auth/auth-method';

export type UserRole = 'USER' | 'ADMIN';

export type UserProfileRecord = Readonly<{
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
}>;

export type UpdateMeProfilePatch = Readonly<{
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}>;

export type UserRecord = Readonly<{
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  authMethods: ReadonlyArray<AuthMethod>;
  profile: UserProfileRecord | null;
}>;

export type MeView = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<UserRole>;
  authMethods: ReadonlyArray<AuthMethod>;
  profile: UserProfileRecord;
}>;
