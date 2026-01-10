import type { UserRecord } from '../users.types';

export interface UsersRepository {
  findById(userId: string): Promise<UserRecord | null>;
}
