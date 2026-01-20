import type { Prisma } from '@prisma/client';

// NOTE: These are row-level locks (`SELECT ... FOR UPDATE`), not Postgres advisory locks.
// Keep helpers here narrowly scoped and named after the invariant they protect.

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
