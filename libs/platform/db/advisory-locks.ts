import type { Prisma } from '@prisma/client';

type LockedAdminRow = Readonly<{ id: string }>;

export async function lockActiveAdminInvariant(tx: Prisma.TransactionClient): Promise<number> {
  const locked = await tx.$queryRaw<LockedAdminRow[]>`
    SELECT id
    FROM "User"
    WHERE role = 'ADMIN' AND status = 'ACTIVE'
    FOR UPDATE
  `;
  return locked.length;
}
