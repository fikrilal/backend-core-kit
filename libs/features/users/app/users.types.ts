import type { AuthMethod } from '../../../shared/auth/auth-method';

export type UserRole = 'USER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserProfileRecord = Readonly<{
  profileImageFileId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
}>;

export type UpdateMeProfilePatch = Readonly<{
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}>;

export type AccountDeletionView = Readonly<{
  requestedAt: string;
  scheduledFor: string;
}>;

export type UserRecord = Readonly<{
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  status: UserStatus;
  deletionRequestedAt: Date | null;
  deletionScheduledFor: Date | null;
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
  accountDeletion: AccountDeletionView | null;
}>;
