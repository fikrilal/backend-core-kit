import { Injectable } from '@nestjs/common';
import { Prisma, type User, type UserProfile } from '@prisma/client';
import type { UsersRepository } from '../../app/ports/users.repository';
import type {
  UpdateMeProfilePatch,
  UserProfileRecord,
  UserRecord,
  UserRole,
} from '../../app/users.types';
import { PrismaService } from '../../../../platform/db/prisma.service';

type PrismaUserWithProfile = Pick<User, 'id' | 'email' | 'emailVerifiedAt' | 'role'> & {
  profile: Pick<UserProfile, 'displayName' | 'givenName' | 'familyName'> | null;
};

function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

function toProfileRecord(profile: PrismaUserWithProfile['profile']): UserProfileRecord | null {
  if (!profile) return null;
  return {
    displayName: profile.displayName,
    givenName: profile.givenName,
    familyName: profile.familyName,
  };
}

function toUserRecord(user: PrismaUserWithProfile): UserRecord {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role as UserRole,
    profile: toProfileRecord(user.profile),
  };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        profile: { select: { displayName: true, givenName: true, familyName: true } },
      },
    });
    return user ? toUserRecord(user) : null;
  }

  async updateProfile(userId: string, patch: UpdateMeProfilePatch): Promise<UserRecord | null> {
    const client = this.prisma.getClient();

    const profileData: {
      displayName?: string | null;
      givenName?: string | null;
      familyName?: string | null;
    } = {};

    if (patch.displayName !== undefined) profileData.displayName = patch.displayName;
    if (patch.givenName !== undefined) profileData.givenName = patch.givenName;
    if (patch.familyName !== undefined) profileData.familyName = patch.familyName;

    try {
      const user = await client.user.update({
        where: { id: userId },
        data: {
          profile: {
            upsert: {
              create: profileData,
              update: profileData,
            },
          },
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          role: true,
          profile: { select: { displayName: true, givenName: true, familyName: true } },
        },
      });

      return toUserRecord(user);
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) return null;
      throw err;
    }
  }
}
