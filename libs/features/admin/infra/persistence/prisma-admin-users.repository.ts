import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { UserStatus as PrismaUserStatus } from '@prisma/client';
import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
} from '../../app/admin-users.types';
import type {
  AdminUsersRepository,
  SetUserRoleInput,
  SetUserRoleResult,
  SetUserStatusInput,
  SetUserStatusResult,
} from '../../app/ports/admin-users.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { lockActiveAdminInvariant } from '../../../../platform/db/row-locks';
import { withTransactionRetry } from '../../../../platform/db/tx-retry';
import {
  ADMIN_USER_LIST_SELECT,
  buildUsersAfterCursorWhere,
  buildUsersNextCursor,
  mapUsersFilters,
  mapUsersSearchWhere,
  mergeUsersWhere,
  toAdminUserListItem,
  usersSortOrderBy,
} from './prisma-admin-users.query-builders';

@Injectable()
export class PrismaAdminUsersRepository implements AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult> {
    const client = this.prisma.getClient();

    const baseWhere = mergeUsersWhere([
      mapUsersSearchWhere(query.q),
      mapUsersFilters(query.filters),
    ]);
    const afterWhere = buildUsersAfterCursorWhere(query);
    const where = mergeUsersWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((spec) => usersSortOrderBy(spec.field, spec.direction));

    const take = query.limit + 1;
    const users = await client.user.findMany({
      where,
      orderBy,
      take,
      select: ADMIN_USER_LIST_SELECT,
    });

    const hasMore = users.length > query.limit;
    const page = hasMore ? users.slice(0, query.limit) : users;

    const items = page.map(toAdminUserListItem);
    const nextCursor = buildUsersNextCursor(query, hasMore, page.at(-1));

    return {
      items,
      limit: query.limit,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult> {
    const client = this.prisma.getClient();
    const nextRole = input.role === 'ADMIN' ? PrismaUserRole.ADMIN : PrismaUserRole.USER;

    return await withTransactionRetry(
      client,
      async (tx) => {
        const found = await tx.user.findUnique({
          where: { id: input.targetUserId },
          select: ADMIN_USER_LIST_SELECT,
        });

        if (!found) return { kind: 'not_found' };

        if (found.status === PrismaUserStatus.DELETED) {
          return { kind: 'not_found' };
        }

        if (found.role === nextRole) {
          return { kind: 'ok', user: toAdminUserListItem(found) };
        }

        if (
          found.role === PrismaUserRole.ADMIN &&
          found.status === PrismaUserStatus.ACTIVE &&
          nextRole !== PrismaUserRole.ADMIN
        ) {
          const adminCount = await lockActiveAdminInvariant(tx);
          if (adminCount <= 1) return { kind: 'last_admin' };
        }

        const updated = await tx.user.update({
          where: { id: input.targetUserId },
          data: { role: nextRole },
          select: ADMIN_USER_LIST_SELECT,
        });

        await tx.userRoleChangeAudit.create({
          data: {
            actorUserId: input.actorUserId,
            actorSessionId: input.actorSessionId,
            targetUserId: input.targetUserId,
            oldRole: found.role,
            newRole: updated.role,
            traceId: input.traceId,
          },
        });

        return { kind: 'ok', user: toAdminUserListItem(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async setUserStatus(input: SetUserStatusInput): Promise<SetUserStatusResult> {
    const client = this.prisma.getClient();
    const nextStatus = (() => {
      switch (input.status) {
        case 'ACTIVE':
          return PrismaUserStatus.ACTIVE;
        case 'SUSPENDED':
          return PrismaUserStatus.SUSPENDED;
        default: {
          const unreachable: never = input.status;
          throw new Error(`Unexpected user status: ${String(unreachable)}`);
        }
      }
    })();

    return await withTransactionRetry(
      client,
      async (tx) => {
        const found = await tx.user.findUnique({
          where: { id: input.targetUserId },
          select: ADMIN_USER_LIST_SELECT,
        });

        if (!found) return { kind: 'not_found' };

        if (found.status === PrismaUserStatus.DELETED) {
          return { kind: 'not_found' };
        }

        if (found.status === nextStatus) {
          return { kind: 'ok', user: toAdminUserListItem(found) };
        }

        if (
          found.role === PrismaUserRole.ADMIN &&
          found.status === PrismaUserStatus.ACTIVE &&
          nextStatus === PrismaUserStatus.SUSPENDED
        ) {
          const activeAdminCount = await lockActiveAdminInvariant(tx);
          if (activeAdminCount <= 1) return { kind: 'last_admin' };
        }

        const now = input.now;
        const updated = await tx.user.update({
          where: { id: input.targetUserId },
          data:
            nextStatus === PrismaUserStatus.SUSPENDED
              ? {
                  status: nextStatus,
                  suspendedAt: now,
                  ...(input.reason !== undefined ? { suspendedReason: input.reason } : {}),
                }
              : {
                  status: nextStatus,
                  suspendedAt: null,
                  suspendedReason: null,
                },
          select: ADMIN_USER_LIST_SELECT,
        });

        await tx.userStatusChangeAudit.create({
          data: {
            actorUserId: input.actorUserId,
            actorSessionId: input.actorSessionId,
            targetUserId: input.targetUserId,
            oldStatus: found.status,
            newStatus: updated.status,
            reason: nextStatus === PrismaUserStatus.SUSPENDED ? (input.reason ?? null) : null,
            traceId: input.traceId,
          },
        });

        if (nextStatus === PrismaUserStatus.SUSPENDED) {
          // Reduce the risk window by revoking sessions (access tokens still expire on TTL).
          await tx.session.updateMany({
            where: { userId: input.targetUserId, revokedAt: null },
            data: { revokedAt: now, activeKey: null },
          });

          await tx.refreshToken.updateMany({
            where: { revokedAt: null, session: { userId: input.targetUserId } },
            data: { revokedAt: now },
          });
        }

        return { kind: 'ok', user: toAdminUserListItem(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
