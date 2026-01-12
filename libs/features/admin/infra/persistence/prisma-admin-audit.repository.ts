import { Injectable } from '@nestjs/common';
import { Prisma, type UserAccountDeletionAction, type UserRole } from '@prisma/client';
import { UserAccountDeletionAction as PrismaUserAccountDeletionAction } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import {
  encodeCursorV1,
  type FilterExpr,
  type ListQuery,
  type SortSpec,
} from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAction,
  AdminUserAccountDeletionAuditListItem,
  AdminUserAccountDeletionAuditListResult,
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserRoleChangeAuditListItem,
  AdminUserRoleChangeAuditListResult,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
} from '../../app/admin-audit.types';
import type { AdminAuditRepository } from '../../app/ports/admin-audit.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';

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

function sortFieldOrderBy(
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

function accountDeletionSortFieldOrderBy(
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

function equalsForCursor(
  field: AdminUserRoleChangeAuditsSortField,
  value: string | number | boolean,
): Prisma.UserRoleChangeAuditWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      return { createdAt: { equals: new Date(value) } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return { id: { equals: value } };
    }
  }
}

function equalsForAccountDeletionCursor(
  field: AdminUserAccountDeletionAuditsSortField,
  value: string | number | boolean,
): Prisma.UserAccountDeletionAuditWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      return { createdAt: { equals: new Date(value) } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return { id: { equals: value } };
    }
  }
}

function compareForCursor(
  field: AdminUserRoleChangeAuditsSortField,
  direction: 'asc' | 'desc',
  value: string | number | boolean,
): Prisma.UserRoleChangeAuditWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      const date = new Date(value);
      return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return direction === 'asc' ? { id: { gt: value } } : { id: { lt: value } };
    }
  }
}

function compareForAccountDeletionCursor(
  field: AdminUserAccountDeletionAuditsSortField,
  direction: 'asc' | 'desc',
  value: string | number | boolean,
): Prisma.UserAccountDeletionAuditWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      const date = new Date(value);
      return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return direction === 'asc' ? { id: { gt: value } } : { id: { lt: value } };
    }
  }
}

function buildAfterCursorWhere(
  sort: ReadonlyArray<SortSpec<AdminUserRoleChangeAuditsSortField>>,
  after: Readonly<Partial<Record<AdminUserRoleChangeAuditsSortField, string | number | boolean>>>,
): Prisma.UserRoleChangeAuditWhereInput {
  if (sort.length === 0) return {};

  const clauses: Prisma.UserRoleChangeAuditWhereInput[] = [];

  for (let i = 0; i < sort.length; i += 1) {
    const and: Prisma.UserRoleChangeAuditWhereInput[] = [];

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

function buildAfterAccountDeletionCursorWhere(
  sort: ReadonlyArray<SortSpec<AdminUserAccountDeletionAuditsSortField>>,
  after: Readonly<
    Partial<Record<AdminUserAccountDeletionAuditsSortField, string | number | boolean>>
  >,
): Prisma.UserAccountDeletionAuditWhereInput {
  if (sort.length === 0) return {};

  const clauses: Prisma.UserAccountDeletionAuditWhereInput[] = [];

  for (let i = 0; i < sort.length; i += 1) {
    const and: Prisma.UserAccountDeletionAuditWhereInput[] = [];

    for (let j = 0; j < i; j += 1) {
      const field = sort[j].field;
      const value = after[field];
      if (value === undefined) {
        throw new Error(`Cursor missing value for sort field "${String(field)}"`);
      }
      and.push(equalsForAccountDeletionCursor(field, value));
    }

    const field = sort[i].field;
    const value = after[field];
    if (value === undefined) {
      throw new Error(`Cursor missing value for sort field "${String(field)}"`);
    }
    and.push(compareForAccountDeletionCursor(field, sort[i].direction, value));

    clauses.push({ AND: and });
  }

  return { OR: clauses };
}

function mapFilters(
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

function mapAccountDeletionFilters(
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
          if (typeof filter.value !== 'string' || !isPrismaAccountDeletionAction(filter.value))
            break;
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

function mergeWhere(
  parts: Prisma.UserRoleChangeAuditWhereInput[],
): Prisma.UserRoleChangeAuditWhereInput {
  const nonEmpty = parts.filter((p) => Object.keys(p).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { AND: nonEmpty };
}

function mergeAccountDeletionWhere(
  parts: Prisma.UserAccountDeletionAuditWhereInput[],
): Prisma.UserAccountDeletionAuditWhereInput {
  const nonEmpty = parts.filter((p) => Object.keys(p).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { AND: nonEmpty };
}

function toListItem(audit: {
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  oldRole: UserRole;
  newRole: UserRole;
  traceId: string;
  createdAt: Date;
}): AdminUserRoleChangeAuditListItem {
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

function toAccountDeletionListItem(audit: {
  id: string;
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  action: UserAccountDeletionAction;
  traceId: string;
  createdAt: Date;
}): AdminUserAccountDeletionAuditListItem {
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

@Injectable()
export class PrismaAdminAuditRepository implements AdminAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult> {
    const client = this.prisma.getClient();

    const baseWhere = mapFilters(query.filters);

    const afterWhere =
      query.cursor && query.cursor.after
        ? buildAfterCursorWhere(query.sort, query.cursor.after)
        : {};

    const where = mergeWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((s) => sortFieldOrderBy(s.field, s.direction));

    const take = query.limit + 1;
    const audits = await client.userRoleChangeAudit.findMany({
      where,
      orderBy,
      take,
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

    const hasMore = audits.length > query.limit;
    const page = hasMore ? audits.slice(0, query.limit) : audits;

    const items = page.map(toListItem);

    const nextCursor = (() => {
      if (!hasMore) return undefined;
      const last = page.at(-1);
      if (!last) return undefined;

      const after: Partial<Record<AdminUserRoleChangeAuditsSortField, string | number | boolean>> =
        {};
      for (const s of query.sort) {
        if (s.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
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

  async listUserAccountDeletionAudits(
    query: ListQuery<
      AdminUserAccountDeletionAuditsSortField,
      AdminUserAccountDeletionAuditsFilterField
    >,
  ): Promise<AdminUserAccountDeletionAuditListResult> {
    const client = this.prisma.getClient();

    const baseWhere = mapAccountDeletionFilters(query.filters);

    const afterWhere =
      query.cursor && query.cursor.after
        ? buildAfterAccountDeletionCursorWhere(query.sort, query.cursor.after)
        : {};

    const where = mergeAccountDeletionWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((s) => accountDeletionSortFieldOrderBy(s.field, s.direction));

    const take = query.limit + 1;
    const audits = await client.userAccountDeletionAudit.findMany({
      where,
      orderBy,
      take,
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

    const hasMore = audits.length > query.limit;
    const page = hasMore ? audits.slice(0, query.limit) : audits;

    const items = page.map(toAccountDeletionListItem);

    const nextCursor = (() => {
      if (!hasMore) return undefined;
      const last = page.at(-1);
      if (!last) return undefined;

      const after: Partial<
        Record<AdminUserAccountDeletionAuditsSortField, string | number | boolean>
      > = {};
      for (const s of query.sort) {
        if (s.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
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
}
