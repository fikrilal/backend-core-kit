import type { Prisma } from '@prisma/client';
import { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
import type { PrismaService } from '../../../../platform/db/prisma.service';
import type { Clock } from '../../app/time';
import { PrismaUsersRepository } from './prisma-users.repository';

function createPrismaStub(params: {
  lockCount: number;
  userRow: Readonly<{
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    role: PrismaUserRole;
    status: PrismaUserStatus;
    deletionRequestedAt: Date | null;
    deletionScheduledFor: Date | null;
    profile: Readonly<{
      profileImageFileId: string | null;
      displayName: string | null;
      givenName: string | null;
      familyName: string | null;
    }> | null;
    passwordCredential: Readonly<{ userId: string }> | null;
    externalIdentities: Array<Readonly<{ provider: string }>>;
  }> | null;
}): Readonly<{
  prisma: PrismaService;
  userUpdateManyCalls: Prisma.UserUpdateManyArgs[];
  profileUpsertCalls: Prisma.UserProfileUpsertArgs[];
  userFindUniqueCalls: Prisma.UserFindUniqueArgs[];
}> {
  const userUpdateManyCalls: Prisma.UserUpdateManyArgs[] = [];
  const profileUpsertCalls: Prisma.UserProfileUpsertArgs[] = [];
  const userFindUniqueCalls: Prisma.UserFindUniqueArgs[] = [];

  const tx = {
    user: {
      updateMany: async (args: Prisma.UserUpdateManyArgs) => {
        userUpdateManyCalls.push(args);
        return { count: params.lockCount };
      },
      findUnique: async (args: Prisma.UserFindUniqueArgs) => {
        userFindUniqueCalls.push(args);
        return params.userRow;
      },
    },
    userProfile: {
      upsert: async (args: Prisma.UserProfileUpsertArgs) => {
        profileUpsertCalls.push(args);
        return { userId: 'user-1' };
      },
    },
  };

  const client = {
    $transaction: async <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      _options?: unknown,
    ): Promise<T> => await fn(tx as unknown as Prisma.TransactionClient),
  };

  const prisma = { getClient: () => client } as unknown as PrismaService;
  return { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls };
}

describe('PrismaUsersRepository.updateProfile (unit)', () => {
  it('returns null and does not upsert when the user is deleted (or missing)', async () => {
    const { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls } =
      createPrismaStub({ lockCount: 0, userRow: null });
    const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') } satisfies Clock;
    const repo = new PrismaUsersRepository(prisma, clock);

    const res = await repo.updateProfile('user-1', { displayName: 'Dante' });

    expect(res).toBeNull();
    expect(userUpdateManyCalls).toEqual([
      {
        where: { id: 'user-1', status: { not: PrismaUserStatus.DELETED } },
        data: { updatedAt: expect.any(Date) },
      },
    ]);
    expect(profileUpsertCalls).toHaveLength(0);
    expect(userFindUniqueCalls).toHaveLength(0);
  });

  it('upserts the profile only after locking a non-deleted user', async () => {
    const { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls } =
      createPrismaStub({
        lockCount: 1,
        userRow: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: null,
          role: PrismaUserRole.USER,
          status: PrismaUserStatus.ACTIVE,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          profile: {
            profileImageFileId: null,
            displayName: 'Dante',
            givenName: null,
            familyName: null,
          },
          passwordCredential: null,
          externalIdentities: [],
        },
      });
    const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') } satisfies Clock;
    const repo = new PrismaUsersRepository(prisma, clock);

    const res = await repo.updateProfile('user-1', { displayName: 'Dante' });

    expect(userUpdateManyCalls).toHaveLength(1);
    expect(profileUpsertCalls).toEqual([
      {
        where: { userId: 'user-1' },
        create: { userId: 'user-1', displayName: 'Dante' },
        update: { displayName: 'Dante' },
      },
    ]);
    expect(userFindUniqueCalls).toHaveLength(1);
    expect(res).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: null,
      role: 'USER',
      status: 'ACTIVE',
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      authMethods: [],
      profile: {
        profileImageFileId: null,
        displayName: 'Dante',
        givenName: null,
        familyName: null,
      },
    });
  });
});
