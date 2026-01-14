import { UserAccountDeletionAction, UserRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { decodeCursorV1 } from '../../../../shared/list-query';
import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
} from '../../app/admin-audit.types';
import type { PrismaService } from '../../../../platform/db/prisma.service';
import { PrismaAdminAuditRepository } from './prisma-admin-audit.repository';

type RoleChangeAuditRow = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  oldRole: UserRole;
  newRole: UserRole;
  traceId: string;
  createdAt: Date;
}>;

type AccountDeletionAuditRow = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  action: UserAccountDeletionAction;
  traceId: string;
  createdAt: Date;
}>;

function createPrismaStub(params: {
  roleChangeRows?: ReadonlyArray<RoleChangeAuditRow>;
  accountDeletionRows?: ReadonlyArray<AccountDeletionAuditRow>;
}): Readonly<{
  prisma: PrismaService;
  roleChangeCalls: Prisma.UserRoleChangeAuditFindManyArgs[];
  accountDeletionCalls: Prisma.UserAccountDeletionAuditFindManyArgs[];
}> {
  const roleChangeCalls: Prisma.UserRoleChangeAuditFindManyArgs[] = [];
  const accountDeletionCalls: Prisma.UserAccountDeletionAuditFindManyArgs[] = [];

  const roleChangeRows = params.roleChangeRows ?? [];
  const accountDeletionRows = params.accountDeletionRows ?? [];

  const client = {
    userRoleChangeAudit: {
      findMany: async (args: Prisma.UserRoleChangeAuditFindManyArgs) => {
        roleChangeCalls.push(args);
        return roleChangeRows;
      },
    },
    userAccountDeletionAudit: {
      findMany: async (args: Prisma.UserAccountDeletionAuditFindManyArgs) => {
        accountDeletionCalls.push(args);
        return accountDeletionRows;
      },
    },
  };

  const prisma = { getClient: () => client } as unknown as PrismaService;
  return { prisma, roleChangeCalls, accountDeletionCalls };
}

describe('PrismaAdminAuditRepository', () => {
  describe('listUserRoleChangeAudits', () => {
    it('maps filters/orderBy/take and shapes deterministic list items + nextCursor', async () => {
      const row1: RoleChangeAuditRow = {
        id: '11111111-1111-4111-8111-111111111111',
        actorUserId: 'actor-user-1',
        actorSessionId: 'actor-session-1',
        targetUserId: 'target-user-1',
        oldRole: UserRole.USER,
        newRole: UserRole.ADMIN,
        traceId: 'trace-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const row2: RoleChangeAuditRow = {
        id: '22222222-2222-4222-8222-222222222222',
        actorUserId: 'actor-user-1',
        actorSessionId: 'actor-session-1',
        targetUserId: 'target-user-2',
        oldRole: UserRole.ADMIN,
        newRole: UserRole.USER,
        traceId: 'trace-1',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      const row3: RoleChangeAuditRow = {
        id: '33333333-3333-4333-8333-333333333333',
        actorUserId: 'actor-user-1',
        actorSessionId: 'actor-session-1',
        targetUserId: 'target-user-3',
        oldRole: UserRole.USER,
        newRole: UserRole.ADMIN,
        traceId: 'trace-1',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      };

      const { prisma, roleChangeCalls } = createPrismaStub({ roleChangeRows: [row1, row2, row3] });
      const repo = new PrismaAdminAuditRepository(prisma);

      const query: ListQuery<
        AdminUserRoleChangeAuditsSortField,
        AdminUserRoleChangeAuditsFilterField
      > = {
        limit: 2,
        sort: [
          { field: 'createdAt', direction: 'desc' },
          { field: 'id', direction: 'desc' },
        ],
        normalizedSort: '-createdAt,-id',
        filters: [
          { field: 'actorUserId', op: 'eq', value: 'actor-user-1' },
          { field: 'oldRole', op: 'in', value: ['ADMIN'] },
          { field: 'createdAt', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
          { field: 'traceId', op: 'eq', value: 'trace-1' },
        ],
      };

      const res = await repo.listUserRoleChangeAudits(query);

      expect(roleChangeCalls).toHaveLength(1);
      expect(roleChangeCalls[0]).toEqual({
        where: {
          AND: [
            { actorUserId: { equals: 'actor-user-1' } },
            { oldRole: { in: ['ADMIN'] } },
            { createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') } },
            { traceId: { equals: 'trace-1' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
        select: {
          id: true,
          actorUserId: true,
          actorSessionId: true,
          targetUserId: true,
          oldRole: true,
          newRole: true,
          traceId: true,
          createdAt: true,
        },
      });

      expect(res.items).toEqual([
        {
          id: row1.id,
          actorUserId: row1.actorUserId,
          actorSessionId: row1.actorSessionId,
          targetUserId: row1.targetUserId,
          oldRole: 'USER',
          newRole: 'ADMIN',
          traceId: row1.traceId,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: row2.id,
          actorUserId: row2.actorUserId,
          actorSessionId: row2.actorSessionId,
          targetUserId: row2.targetUserId,
          oldRole: 'ADMIN',
          newRole: 'USER',
          traceId: row2.traceId,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
      expect(res.limit).toBe(2);
      expect(res.hasMore).toBe(true);
      expect(res.nextCursor).toBeDefined();

      const decoded = decodeCursorV1(res.nextCursor as string, {
        expectedSort: '-createdAt,-id',
        sortFields: ['createdAt', 'id'],
        allowed: { createdAt: { type: 'datetime' }, id: { type: 'uuid' } },
      });
      expect(decoded.after).toEqual({
        createdAt: '2026-01-02T00:00:00.000Z',
        id: row2.id,
      });
    });

    it('applies keyset pagination cursor where', async () => {
      const { prisma, roleChangeCalls } = createPrismaStub({ roleChangeRows: [] });
      const repo = new PrismaAdminAuditRepository(prisma);

      const query: ListQuery<
        AdminUserRoleChangeAuditsSortField,
        AdminUserRoleChangeAuditsFilterField
      > = {
        limit: 1,
        sort: [
          { field: 'createdAt', direction: 'desc' },
          { field: 'id', direction: 'desc' },
        ],
        normalizedSort: '-createdAt,-id',
        cursor: {
          v: 1,
          sort: '-createdAt,-id',
          after: {
            createdAt: '2026-01-01T00:00:00.000Z',
            id: '11111111-1111-4111-8111-111111111111',
          },
        },
        cursorRaw: 'cursor-raw',
        filters: [],
      };

      await repo.listUserRoleChangeAudits(query);

      expect(roleChangeCalls).toHaveLength(1);
      expect(roleChangeCalls[0].where).toEqual({
        OR: [
          { AND: [{ createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } }] },
          {
            AND: [
              { createdAt: { equals: new Date('2026-01-01T00:00:00.000Z') } },
              { id: { lt: '11111111-1111-4111-8111-111111111111' } },
            ],
          },
        ],
      });
    });
  });

  describe('listUserAccountDeletionAudits', () => {
    it('shapes deterministic items and emits nextCursor when paginated', async () => {
      const row1: AccountDeletionAuditRow = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorUserId: 'actor-user-1',
        actorSessionId: 'actor-session-1',
        targetUserId: 'target-user-1',
        action: UserAccountDeletionAction.REQUESTED,
        traceId: 'trace-2',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      };
      const row2: AccountDeletionAuditRow = {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        actorUserId: 'actor-user-1',
        actorSessionId: 'actor-session-1',
        targetUserId: 'target-user-1',
        action: UserAccountDeletionAction.CANCELED,
        traceId: 'trace-2',
        createdAt: new Date('2026-02-02T00:00:00.000Z'),
      };

      const { prisma, accountDeletionCalls } = createPrismaStub({
        accountDeletionRows: [row1, row2],
      });
      const repo = new PrismaAdminAuditRepository(prisma);

      const query: ListQuery<
        AdminUserAccountDeletionAuditsSortField,
        AdminUserAccountDeletionAuditsFilterField
      > = {
        limit: 1,
        sort: [
          { field: 'createdAt', direction: 'desc' },
          { field: 'id', direction: 'desc' },
        ],
        normalizedSort: '-createdAt,-id',
        filters: [{ field: 'action', op: 'eq', value: 'REQUESTED' }],
      };

      const res = await repo.listUserAccountDeletionAudits(query);

      expect(accountDeletionCalls).toHaveLength(1);
      expect(accountDeletionCalls[0]).toEqual({
        where: { AND: [{ action: { equals: 'REQUESTED' } }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
        select: {
          id: true,
          actorUserId: true,
          actorSessionId: true,
          targetUserId: true,
          action: true,
          traceId: true,
          createdAt: true,
        },
      });

      expect(res.items).toEqual([
        {
          id: row1.id,
          actorUserId: row1.actorUserId,
          actorSessionId: row1.actorSessionId,
          targetUserId: row1.targetUserId,
          action: 'REQUESTED',
          traceId: row1.traceId,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ]);
      expect(res.hasMore).toBe(true);
      expect(res.nextCursor).toBeDefined();

      const decoded = decodeCursorV1(res.nextCursor as string, {
        expectedSort: '-createdAt,-id',
        sortFields: ['createdAt', 'id'],
        allowed: { createdAt: { type: 'datetime' }, id: { type: 'uuid' } },
      });
      expect(decoded.after).toEqual({
        createdAt: '2026-02-01T00:00:00.000Z',
        id: row1.id,
      });
    });
  });
});
