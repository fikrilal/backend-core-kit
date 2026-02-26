import { Injectable } from '@nestjs/common';
import { Prisma, type UserRole, type UserStatus } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { UserStatus as PrismaUserStatus } from '@prisma/client';
import {
  buildCursorAfterWhere,
  encodeCursorV1,
  type FilterExpr,
  type ListQuery,
} from '../../../../shared/list-query';
import type {
  AdminUserListItem,
  AdminUserRole,
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
} from '../../app/admin-users.types';
import type {
  AdminUsersRepository,
  SetUserRoleResult,
  SetUserRoleInput,
  SetUserStatusInput,
  SetUserStatusResult,
} from '../../app/ports/admin-users.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { lockActiveAdminInvariant } from '../../../../platform/db/row-locks';
import { withTransactionRetry } from '../../../../platform/db/tx-retry';

function isPrismaUserRole(value: string): value is UserRole {
  return value === PrismaUserRole.USER || value === PrismaUserRole.ADMIN;
}

function sortFieldOrderBy(
  field: AdminUsersSortField,
  direction: 'asc' | 'desc',
): Prisma.UserOrderByWithRelationInput {
  switch (field) {
    case 'createdAt':
      return { createdAt: direction };
    case 'email':
      return { email: direction };
    case 'id':
      return { id: direction };
  }
}

function equalsForCursor(
  field: AdminUsersSortField,
  value: string | number | boolean,
): Prisma.UserWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      return { createdAt: { equals: new Date(value) } };
    }
    case 'email': {
      if (typeof value !== 'string') throw new Error('Cursor value for email must be a string');
      return { email: { equals: value } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return { id: { equals: value } };
    }
  }
}

function compareForCursor(
  field: AdminUsersSortField,
  direction: 'asc' | 'desc',
  value: string | number | boolean,
): Prisma.UserWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      const date = new Date(value);
      return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
    }
    case 'email': {
      if (typeof value !== 'string') throw new Error('Cursor value for email must be a string');
      return direction === 'asc' ? { email: { gt: value } } : { email: { lt: value } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return direction === 'asc' ? { id: { gt: value } } : { id: { lt: value } };
    }
  }
}

function mapFilters(
  filters: ReadonlyArray<FilterExpr<AdminUsersFilterField>>,
): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  for (const filter of filters) {
    switch (filter.field) {
      case 'role': {
        if (filter.op === 'eq') {
          if (typeof filter.value !== 'string' || !isPrismaUserRole(filter.value)) break;
          and.push({ role: { equals: filter.value } });
        } else if (filter.op === 'in') {
          const roles = filter.value.filter((v): v is string => typeof v === 'string');
          const parsed = roles.filter(isPrismaUserRole);
          if (parsed.length > 0) {
            and.push({ role: { in: parsed } });
          }
        }
        break;
      }
      case 'emailVerified': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'boolean') break;
        if (filter.value) {
          and.push({ emailVerifiedAt: { not: null } });
        } else {
          and.push({ emailVerifiedAt: null });
        }
        break;
      }
      case 'createdAt': {
        if (typeof filter.value !== 'string') break;
        const date = new Date(filter.value);
        if (Number.isNaN(date.getTime())) break;
        if (filter.op === 'gte') {
          and.push({ createdAt: { gte: date } });
        } else if (filter.op === 'lte') {
          and.push({ createdAt: { lte: date } });
        }
        break;
      }
      case 'email': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ email: { equals: filter.value, mode: 'insensitive' } });
        break;
      }
    }
  }

  return and.length > 0 ? { AND: and } : {};
}

function mapSearch(q: string | undefined): Prisma.UserWhereInput {
  if (!q || q.trim() === '') return {};
  const term = q.trim();
  return { email: { contains: term, mode: 'insensitive' } };
}

function mergeWhere(parts: Prisma.UserWhereInput[]): Prisma.UserWhereInput {
  const nonEmpty = parts.filter((p) => Object.keys(p).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { AND: nonEmpty };
}

function toListItem(user: {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  createdAt: Date;
}): AdminUserListItem {
  const role = String(user.role) as AdminUserRole;

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    roles: [role],
    status: String(user.status) as AdminUserListItem['status'],
    suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
    suspendedReason: user.suspendedReason ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class PrismaAdminUsersRepository implements AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ): Promise<AdminUsersListResult> {
    const client = this.prisma.getClient();

    const baseWhere = mergeWhere([mapSearch(query.q), mapFilters(query.filters)]);

    const afterWhere =
      query.cursor && query.cursor.after
        ? buildCursorAfterWhere({
            sort: query.sort,
            after: query.cursor.after,
            builders: {
              equals: equalsForCursor,
              compare: compareForCursor,
              and: (clauses) => ({ AND: clauses }),
              or: (clauses) => ({ OR: clauses }),
              empty: () => ({}),
            },
          })
        : {};

    const where = mergeWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((s) => sortFieldOrderBy(s.field, s.direction));

    const take = query.limit + 1;
    const users = await client.user.findMany({
      where,
      orderBy,
      take,
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        status: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
      },
    });

    const hasMore = users.length > query.limit;
    const page = hasMore ? users.slice(0, query.limit) : users;

    const items = page.map(toListItem);

    const nextCursor = (() => {
      if (!hasMore) return undefined;
      const last = page.at(-1);
      if (!last) return undefined;

      const after: Partial<Record<AdminUsersSortField, string | number | boolean>> = {};
      for (const s of query.sort) {
        if (s.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
        else if (s.field === 'email') after.email = last.email;
        else if (s.field === 'id') after.id = last.id;
      }

      return encodeCursorV1({
        v: 1,
        sort: query.normalizedSort,
        after,
      });
    })();

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
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            role: true,
            status: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
          },
        });

        if (!found) return { kind: 'not_found' };

        if (found.status === PrismaUserStatus.DELETED) {
          return { kind: 'not_found' };
        }

        if (found.role === nextRole) {
          return { kind: 'ok', user: toListItem(found) };
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
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            role: true,
            status: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
          },
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

        return { kind: 'ok', user: toListItem(updated) };
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
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            role: true,
            status: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
          },
        });

        if (!found) return { kind: 'not_found' };

        if (found.status === PrismaUserStatus.DELETED) {
          return { kind: 'not_found' };
        }

        if (found.status === nextStatus) {
          return { kind: 'ok', user: toListItem(found) };
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
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            role: true,
            status: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
          },
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

        return { kind: 'ok', user: toListItem(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
