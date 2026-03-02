import { Injectable } from '@nestjs/common';
import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAuditListResult,
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserRoleChangeAuditListResult,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
} from '../../app/admin-audit.types';
import type { AdminAuditRepository } from '../../app/ports/admin-audit.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';
import {
  ACCOUNT_DELETION_AUDIT_LIST_SELECT,
  ROLE_CHANGE_AUDIT_LIST_SELECT,
  accountDeletionAuditSortOrderBy,
  buildAccountDeletionAfterCursorWhere,
  buildAccountDeletionNextCursor,
  buildRoleChangeAfterCursorWhere,
  buildRoleChangeNextCursor,
  mapAccountDeletionAuditFilters,
  mapRoleChangeAuditFilters,
  mergeAccountDeletionAuditWhere,
  mergeRoleChangeAuditWhere,
  roleChangeAuditSortOrderBy,
  toAccountDeletionAuditListItem,
  toRoleChangeAuditListItem,
} from './prisma-admin-audit.query-builders';

@Injectable()
export class PrismaAdminAuditRepository implements AdminAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult> {
    const client = this.prisma.getClient();

    const baseWhere = mapRoleChangeAuditFilters(query.filters);
    const afterWhere = buildRoleChangeAfterCursorWhere(query);
    const where = mergeRoleChangeAuditWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((spec) =>
      roleChangeAuditSortOrderBy(spec.field, spec.direction),
    );

    const take = query.limit + 1;
    const audits = await client.userRoleChangeAudit.findMany({
      where,
      orderBy,
      take,
      select: ROLE_CHANGE_AUDIT_LIST_SELECT,
    });

    const hasMore = audits.length > query.limit;
    const page = hasMore ? audits.slice(0, query.limit) : audits;

    const items = page.map(toRoleChangeAuditListItem);
    const nextCursor = buildRoleChangeNextCursor(query, hasMore, page.at(-1));

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

    const baseWhere = mapAccountDeletionAuditFilters(query.filters);
    const afterWhere = buildAccountDeletionAfterCursorWhere(query);
    const where = mergeAccountDeletionAuditWhere([baseWhere, afterWhere]);

    const orderBy = query.sort.map((spec) =>
      accountDeletionAuditSortOrderBy(spec.field, spec.direction),
    );

    const take = query.limit + 1;
    const audits = await client.userAccountDeletionAudit.findMany({
      where,
      orderBy,
      take,
      select: ACCOUNT_DELETION_AUDIT_LIST_SELECT,
    });

    const hasMore = audits.length > query.limit;
    const page = hasMore ? audits.slice(0, query.limit) : audits;

    const items = page.map(toAccountDeletionAuditListItem);
    const nextCursor = buildAccountDeletionNextCursor(query, hasMore, page.at(-1));

    return {
      items,
      limit: query.limit,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }
}
