import type { Prisma, UserRole, UserStatus } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
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
  AdminUsersSortField,
} from '../../app/admin-users.types';
import {
  createCursorAfterBuilders,
  isEmptyWhereObject,
  mergeWhereClauses,
  parseCursorDateValue,
  parseCursorStringValue,
} from './prisma-list-query.helpers';

export const ADMIN_USER_LIST_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  role: true,
  status: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserListRow = Readonly<{
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  createdAt: Date;
}>;

function isPrismaUserRole(value: string): value is UserRole {
  return value === PrismaUserRole.USER || value === PrismaUserRole.ADMIN;
}

const usersAfterCursorBuilders = createCursorAfterBuilders<
  AdminUsersSortField,
  Prisma.UserWhereInput
>({
  fieldOps: {
    createdAt: {
      equals: (value) => ({ createdAt: { equals: parseCursorDateValue('createdAt', value) } }),
      gt: (value) => ({ createdAt: { gt: parseCursorDateValue('createdAt', value) } }),
      lt: (value) => ({ createdAt: { lt: parseCursorDateValue('createdAt', value) } }),
    },
    email: {
      equals: (value) => ({ email: { equals: parseCursorStringValue('email', value) } }),
      gt: (value) => ({ email: { gt: parseCursorStringValue('email', value) } }),
      lt: (value) => ({ email: { lt: parseCursorStringValue('email', value) } }),
    },
    id: {
      equals: (value) => ({ id: { equals: parseCursorStringValue('id', value) } }),
      gt: (value) => ({ id: { gt: parseCursorStringValue('id', value) } }),
      lt: (value) => ({ id: { lt: parseCursorStringValue('id', value) } }),
    },
  },
  combiners: {
    and: (clauses) => ({ AND: [...clauses] }),
    or: (clauses) => ({ OR: [...clauses] }),
    empty: () => ({}),
  },
});

export function usersSortOrderBy(
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

export function mapUsersFilters(
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

export function mapUsersSearchWhere(q: string | undefined): Prisma.UserWhereInput {
  if (!q || q.trim() === '') return {};
  const term = q.trim();
  return { email: { contains: term, mode: 'insensitive' } };
}

export function mergeUsersWhere(
  parts: ReadonlyArray<Prisma.UserWhereInput>,
): Prisma.UserWhereInput {
  return mergeWhereClauses({
    clauses: parts,
    and: (clauses) => ({ AND: [...clauses] }),
    empty: () => ({}),
    isEmpty: isEmptyWhereObject,
  });
}

export function buildUsersAfterCursorWhere(
  query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
): Prisma.UserWhereInput {
  if (!query.cursor?.after) return {};
  return buildCursorAfterWhere({
    sort: query.sort,
    after: query.cursor.after,
    builders: usersAfterCursorBuilders,
  });
}

export function toAdminUserListItem(user: AdminUserListRow): AdminUserListItem {
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

export function buildUsersNextCursor(
  query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  hasMore: boolean,
  last: AdminUserListRow | undefined,
): string | undefined {
  if (!hasMore || !last) return undefined;

  const after: Partial<Record<AdminUsersSortField, string | number | boolean>> = {};
  for (const spec of query.sort) {
    if (spec.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
    else if (spec.field === 'email') after.email = last.email;
    else if (spec.field === 'id') after.id = last.id;
  }

  return encodeCursorV1({
    v: 1,
    sort: query.normalizedSort,
    after,
  });
}
