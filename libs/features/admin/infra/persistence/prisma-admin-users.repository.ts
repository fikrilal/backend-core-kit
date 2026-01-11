import { Injectable } from '@nestjs/common';
import { Prisma, type UserRole } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import {
  encodeCursorV1,
  type FilterExpr,
  type ListQuery,
  type SortSpec,
} from '../../../../shared/list-query';
import type {
  AdminUserListItem,
  AdminUsersFilterField,
  AdminUsersListResult,
  AdminUsersSortField,
  AdminUserRole,
} from '../../app/admin-users.types';
import type {
  AdminUsersRepository,
  SetUserRoleResult,
} from '../../app/ports/admin-users.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';

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

function buildAfterCursorWhere(
  sort: ReadonlyArray<SortSpec<AdminUsersSortField>>,
  after: Readonly<Partial<Record<AdminUsersSortField, string | number | boolean>>>,
): Prisma.UserWhereInput {
  if (sort.length === 0) return {};

  const clauses: Prisma.UserWhereInput[] = [];

  for (let i = 0; i < sort.length; i += 1) {
    const and: Prisma.UserWhereInput[] = [];

    for (let j = 0; j < i; j += 1) {
      const field = sort[j].field;
      const value = after[field];
      if (value === undefined) {
        throw new Error(`Cursor missing value for sort field "${String(field)}"`);
      }
      and.push(equalsForCursor(field, value));
    }

    const field = sort[i].field;
    const value = after[field];
    if (value === undefined) {
      throw new Error(`Cursor missing value for sort field "${String(field)}"`);
    }
    and.push(compareForCursor(field, sort[i].direction, value));

    clauses.push({ AND: and });
  }

  return { OR: clauses };
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
  createdAt: Date;
}): AdminUserListItem {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    roles: [String(user.role)],
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
        ? buildAfterCursorWhere(query.sort, query.cursor.after)
        : {};

    const where = mergeWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((s) => sortFieldOrderBy(s.field, s.direction));

    const take = query.limit + 1;
    const users = await client.user.findMany({
      where,
      orderBy,
      take,
      select: { id: true, email: true, emailVerifiedAt: true, role: true, createdAt: true },
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

  async setUserRole(userId: string, role: AdminUserRole): Promise<SetUserRoleResult> {
    const client = this.prisma.getClient();
    const nextRole = role === 'ADMIN' ? PrismaUserRole.ADMIN : PrismaUserRole.USER;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const found = await tx.user.findUnique({
              where: { id: userId },
              select: { id: true, email: true, emailVerifiedAt: true, role: true, createdAt: true },
            });

            if (!found) return { kind: 'not_found' };

            if (found.role === nextRole) {
              return { kind: 'ok', user: toListItem(found) };
            }

            if (found.role === PrismaUserRole.ADMIN && nextRole !== PrismaUserRole.ADMIN) {
              const adminCount = await tx.user.count({ where: { role: PrismaUserRole.ADMIN } });
              if (adminCount <= 1) return { kind: 'last_admin' };
            }

            const updated = await tx.user.update({
              where: { id: userId },
              data: { role: nextRole },
              select: { id: true, email: true, emailVerifiedAt: true, role: true, createdAt: true },
            });

            return { kind: 'ok', user: toListItem(updated) };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err: unknown) {
        if (attempt < maxAttempts && isRetryableTransactionError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Unexpected: exhausted transaction retries');
  }
}

function isRetryableTransactionError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return err.code === 'P2034';
}
