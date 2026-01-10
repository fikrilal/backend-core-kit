import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { UsersRepository } from '../../app/ports/users.repository';
import type { UserRecord, UserRole } from '../../app/users.types';
import { PrismaService } from '../../../../platform/db/prisma.service';

function toUserRecord(user: Pick<User, 'id' | 'email' | 'emailVerifiedAt' | 'role'>): UserRecord {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role as UserRole,
  };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, role: true },
    });
    return user ? toUserRecord(user) : null;
  }
}
