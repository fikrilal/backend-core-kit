import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { verifyEmailByTokenHash } from './prisma-auth.repository.users';
import { createPrototypeStub } from '../../../../../test/support/stubs';

function createPrismaStub(params: {
  tokenRow: Readonly<{
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    user: Readonly<{ emailVerifiedAt: Date | null }>;
  }> | null;
}): Readonly<{
  prisma: PrismaService;
  findUniqueCalls: Prisma.EmailVerificationTokenFindUniqueArgs[];
  updateManyCalls: Prisma.EmailVerificationTokenUpdateManyArgs[];
  userUpdateManyCalls: Prisma.UserUpdateManyArgs[];
}> {
  const findUniqueCalls: Prisma.EmailVerificationTokenFindUniqueArgs[] = [];
  const updateManyCalls: Prisma.EmailVerificationTokenUpdateManyArgs[] = [];
  const userUpdateManyCalls: Prisma.UserUpdateManyArgs[] = [];

  const txClient = {
    emailVerificationToken: {
      findUnique: async (args: Prisma.EmailVerificationTokenFindUniqueArgs) => {
        findUniqueCalls.push(args);
        return params.tokenRow;
      },
      updateMany: async (args: Prisma.EmailVerificationTokenUpdateManyArgs) => {
        updateManyCalls.push(args);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async (args: Prisma.UserUpdateManyArgs) => {
        userUpdateManyCalls.push(args);
        return { count: 0 };
      },
    },
  };

  const client = {
    $transaction: async <T>(
      fn: (tx: typeof txClient) => Promise<T>,
      _options?: unknown,
    ): Promise<T> => await fn(txClient),
  };

  const prisma = createPrototypeStub(PrismaService, { getClient: () => client });
  return { prisma, findUniqueCalls, updateManyCalls, userUpdateManyCalls };
}

describe('verifyEmailByTokenHash (unit)', () => {
  it('marks the token used and returns already_verified when the user is already verified', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const tokenHash = 'token-hash';

    const { prisma, updateManyCalls, userUpdateManyCalls } = createPrismaStub({
      tokenRow: {
        id: 'evt-1',
        userId: 'user-1',
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
        usedAt: null,
        revokedAt: null,
        user: { emailVerifiedAt: new Date('2025-12-31T00:00:00.000Z') },
      },
    });

    const res = await verifyEmailByTokenHash(prisma, tokenHash, now);

    expect(res).toEqual({ kind: 'already_verified' });
    expect(userUpdateManyCalls).toHaveLength(0);
    expect(updateManyCalls).toEqual([
      {
        where: { id: 'evt-1', usedAt: null },
        data: { usedAt: now },
      },
    ]);
  });
});
