import type { Prisma, UserAccountDeletionAction, UserRole } from '@prisma/client';
import { UserAccountDeletionAction as PrismaUserAccountDeletionAction } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import {
  buildCursorAfterWhere,
  encodeCursorV1,
  type FilterExpr,
  type ListQuery,
} from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAction,
  AdminUserAccountDeletionAuditListItem,
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserRoleChangeAuditListItem,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
} from '../../app/admin-audit.types';
import {
  createCursorAfterBuilders,
  isEmptyWhereObject,
  mergeWhereClauses,
  parseCursorDateValue,
  parseCursorStringValue,
} from './prisma-list-query.helpers';

export const ROLE_CHANGE_AUDIT_LIST_SELECT = {
  id: true,
  actorUserId: true,
  actorSessionId: true,
  targetUserId: true,
  oldRole: true,
  newRole: true,
  traceId: true,
  createdAt: true,
} satisfies Prisma.UserRoleChangeAuditSelect;

export const ACCOUNT_DELETION_AUDIT_LIST_SELECT = {
  id: true,
  actorUserId: true,
  actorSessionId: true,
  targetUserId: true,
  action: true,
  traceId: true,
  createdAt: true,
} satisfies Prisma.UserAccountDeletionAuditSelect;

export type RoleChangeAuditListRow = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  oldRole: UserRole;
  newRole: UserRole;
  traceId: string;
  createdAt: Date;
}>;

export type AccountDeletionAuditListRow = Readonly<{
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  action: UserAccountDeletionAction;
  traceId: string;
  createdAt: Date;
}>;

function isPrismaUserRole(value: string): value is UserRole {
  return value === PrismaUserRole.USER || value === PrismaUserRole.ADMIN;
}

function isPrismaAccountDeletionAction(value: string): value is UserAccountDeletionAction {
  return (
    value === PrismaUserAccountDeletionAction.REQUESTED ||
    value === PrismaUserAccountDeletionAction.CANCELED ||
    value === PrismaUserAccountDeletionAction.FINALIZED ||
    value === PrismaUserAccountDeletionAction.FINALIZE_BLOCKED_LAST_ADMIN
  );
}

const roleChangeAfterCursorBuilders = createCursorAfterBuilders<
  AdminUserRoleChangeAuditsSortField,
  Prisma.UserRoleChangeAuditWhereInput
>({
  fieldOps: {
    createdAt: {
      equals: (value) => ({ createdAt: { equals: parseCursorDateValue('createdAt', value) } }),
      gt: (value) => ({ createdAt: { gt: parseCursorDateValue('createdAt', value) } }),
      lt: (value) => ({ createdAt: { lt: parseCursorDateValue('createdAt', value) } }),
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

const accountDeletionAfterCursorBuilders = createCursorAfterBuilders<
  AdminUserAccountDeletionAuditsSortField,
  Prisma.UserAccountDeletionAuditWhereInput
>({
  fieldOps: {
    createdAt: {
      equals: (value) => ({ createdAt: { equals: parseCursorDateValue('createdAt', value) } }),
      gt: (value) => ({ createdAt: { gt: parseCursorDateValue('createdAt', value) } }),
      lt: (value) => ({ createdAt: { lt: parseCursorDateValue('createdAt', value) } }),
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

export function roleChangeAuditSortOrderBy(
  field: AdminUserRoleChangeAuditsSortField,
  direction: 'asc' | 'desc',
): Prisma.UserRoleChangeAuditOrderByWithRelationInput {
  switch (field) {
    case 'createdAt':
      return { createdAt: direction };
    case 'id':
      return { id: direction };
  }
}

export function accountDeletionAuditSortOrderBy(
  field: AdminUserAccountDeletionAuditsSortField,
  direction: 'asc' | 'desc',
): Prisma.UserAccountDeletionAuditOrderByWithRelationInput {
  switch (field) {
    case 'createdAt':
      return { createdAt: direction };
    case 'id':
      return { id: direction };
  }
}

export function mapRoleChangeAuditFilters(
  filters: ReadonlyArray<FilterExpr<AdminUserRoleChangeAuditsFilterField>>,
): Prisma.UserRoleChangeAuditWhereInput {
  const and: Prisma.UserRoleChangeAuditWhereInput[] = [];

  for (const filter of filters) {
    switch (filter.field) {
      case 'actorUserId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ actorUserId: { equals: filter.value } });
        break;
      }
      case 'targetUserId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ targetUserId: { equals: filter.value } });
        break;
      }
      case 'oldRole': {
        if (filter.op === 'eq') {
          if (typeof filter.value !== 'string' || !isPrismaUserRole(filter.value)) break;
          and.push({ oldRole: { equals: filter.value } });
        } else if (filter.op === 'in') {
          const roles = filter.value.filter((v): v is string => typeof v === 'string');
          const parsed = roles.filter(isPrismaUserRole);
          if (parsed.length > 0) {
            and.push({ oldRole: { in: parsed } });
          }
        }
        break;
      }
      case 'newRole': {
        if (filter.op === 'eq') {
          if (typeof filter.value !== 'string' || !isPrismaUserRole(filter.value)) break;
          and.push({ newRole: { equals: filter.value } });
        } else if (filter.op === 'in') {
          const roles = filter.value.filter((v): v is string => typeof v === 'string');
          const parsed = roles.filter(isPrismaUserRole);
          if (parsed.length > 0) {
            and.push({ newRole: { in: parsed } });
          }
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
      case 'traceId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ traceId: { equals: filter.value } });
        break;
      }
    }
  }

  return and.length > 0 ? { AND: and } : {};
}

export function mapAccountDeletionAuditFilters(
  filters: ReadonlyArray<FilterExpr<AdminUserAccountDeletionAuditsFilterField>>,
): Prisma.UserAccountDeletionAuditWhereInput {
  const and: Prisma.UserAccountDeletionAuditWhereInput[] = [];

  for (const filter of filters) {
    switch (filter.field) {
      case 'actorUserId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ actorUserId: { equals: filter.value } });
        break;
      }
      case 'targetUserId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ targetUserId: { equals: filter.value } });
        break;
      }
      case 'action': {
        if (filter.op === 'eq') {
          if (typeof filter.value !== 'string' || !isPrismaAccountDeletionAction(filter.value)) {
            break;
          }
          and.push({ action: { equals: filter.value } });
        } else if (filter.op === 'in') {
          const actions = filter.value.filter((v): v is string => typeof v === 'string');
          const parsed = actions.filter(isPrismaAccountDeletionAction);
          if (parsed.length > 0) {
            and.push({ action: { in: parsed } });
          }
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
      case 'traceId': {
        if (filter.op !== 'eq') break;
        if (typeof filter.value !== 'string') break;
        and.push({ traceId: { equals: filter.value } });
        break;
      }
    }
  }

  return and.length > 0 ? { AND: and } : {};
}

export function mergeRoleChangeAuditWhere(
  parts: ReadonlyArray<Prisma.UserRoleChangeAuditWhereInput>,
): Prisma.UserRoleChangeAuditWhereInput {
  return mergeWhereClauses({
    clauses: parts,
    and: (clauses) => ({ AND: [...clauses] }),
    empty: () => ({}),
    isEmpty: isEmptyWhereObject,
  });
}

export function mergeAccountDeletionAuditWhere(
  parts: ReadonlyArray<Prisma.UserAccountDeletionAuditWhereInput>,
): Prisma.UserAccountDeletionAuditWhereInput {
  return mergeWhereClauses({
    clauses: parts,
    and: (clauses) => ({ AND: [...clauses] }),
    empty: () => ({}),
    isEmpty: isEmptyWhereObject,
  });
}

export function buildRoleChangeAfterCursorWhere(
  query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
): Prisma.UserRoleChangeAuditWhereInput {
  if (!query.cursor?.after) return {};
  return buildCursorAfterWhere({
    sort: query.sort,
    after: query.cursor.after,
    builders: roleChangeAfterCursorBuilders,
  });
}

export function buildAccountDeletionAfterCursorWhere(
  query: ListQuery<
    AdminUserAccountDeletionAuditsSortField,
    AdminUserAccountDeletionAuditsFilterField
  >,
): Prisma.UserAccountDeletionAuditWhereInput {
  if (!query.cursor?.after) return {};
  return buildCursorAfterWhere({
    sort: query.sort,
    after: query.cursor.after,
    builders: accountDeletionAfterCursorBuilders,
  });
}

export function toRoleChangeAuditListItem(
  audit: RoleChangeAuditListRow,
): AdminUserRoleChangeAuditListItem {
  return {
    id: audit.id,
    actorUserId: audit.actorUserId,
    actorSessionId: audit.actorSessionId,
    targetUserId: audit.targetUserId,
    oldRole: String(audit.oldRole) as AdminUserRoleChangeAuditListItem['oldRole'],
    newRole: String(audit.newRole) as AdminUserRoleChangeAuditListItem['newRole'],
    traceId: audit.traceId,
    createdAt: audit.createdAt.toISOString(),
  };
}

export function toAccountDeletionAuditListItem(
  audit: AccountDeletionAuditListRow,
): AdminUserAccountDeletionAuditListItem {
  return {
    id: audit.id,
    actorUserId: audit.actorUserId,
    actorSessionId: audit.actorSessionId,
    targetUserId: audit.targetUserId,
    action: String(audit.action) as AdminUserAccountDeletionAction,
    traceId: audit.traceId,
    createdAt: audit.createdAt.toISOString(),
  };
}

export function buildRoleChangeNextCursor(
  query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  hasMore: boolean,
  last: RoleChangeAuditListRow | undefined,
): string | undefined {
  if (!hasMore || !last) return undefined;

  const after: Partial<Record<AdminUserRoleChangeAuditsSortField, string | number | boolean>> = {};
  for (const spec of query.sort) {
    if (spec.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
    else if (spec.field === 'id') after.id = last.id;
  }

  return encodeCursorV1({
    v: 1,
    sort: query.normalizedSort,
    after,
  });
}

export function buildAccountDeletionNextCursor(
  query: ListQuery<
    AdminUserAccountDeletionAuditsSortField,
    AdminUserAccountDeletionAuditsFilterField
  >,
  hasMore: boolean,
  last: AccountDeletionAuditListRow | undefined,
): string | undefined {
  if (!hasMore || !last) return undefined;

  const after: Partial<Record<AdminUserAccountDeletionAuditsSortField, string | number | boolean>> =
    {};
  for (const spec of query.sort) {
    if (spec.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
    else if (spec.field === 'id') after.id = last.id;
  }

  return encodeCursorV1({
    v: 1,
    sort: query.normalizedSort,
    after,
  });
}
