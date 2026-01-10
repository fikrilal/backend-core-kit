import type { UpdateMeProfilePatch, UserRecord } from '../users.types';

export interface UsersRepository {
  findById(userId: string): Promise<UserRecord | null>;
  updateProfile(userId: string, patch: UpdateMeProfilePatch): Promise<UserRecord | null>;
}
