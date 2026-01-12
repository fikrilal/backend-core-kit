import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ApiListQuery } from '../../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import type { ListQueryPipeOptions } from '../../../../platform/http/list-query/list-query.pipe';
import { RbacGuard } from '../../../../platform/rbac/rbac.guard';
import { RequirePermissions } from '../../../../platform/rbac/rbac.decorator';
import { UseDbRoles } from '../../../../platform/rbac/use-db-roles.decorator';
import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
} from '../../app/admin-audit.types';
import { AdminAuditService } from '../../app/admin-audit.service';
import { AdminUserAccountDeletionAuditsListEnvelopeDto } from './dtos/admin-user-account-deletion-audit.dto';
import { AdminUserRoleChangeAuditsListEnvelopeDto } from './dtos/admin-user-role-change-audit.dto';

const listUserRoleChangeAuditsQueryOptions = {
  sort: {
    allowed: {
      createdAt: { type: 'datetime' },
      id: { type: 'uuid' },
    },
    default: [{ field: 'createdAt', direction: 'desc' }],
    tieBreaker: { field: 'id', direction: 'desc' },
  },
  filters: {
    actorUserId: { type: 'uuid', ops: ['eq'] },
    targetUserId: { type: 'uuid', ops: ['eq'] },
    oldRole: { type: 'enum', ops: ['eq', 'in'], enumValues: ['USER', 'ADMIN'] },
    newRole: { type: 'enum', ops: ['eq', 'in'], enumValues: ['USER', 'ADMIN'] },
    createdAt: { type: 'datetime', ops: ['gte', 'lte'] },
    traceId: { type: 'string', ops: ['eq'] },
  },
} as const satisfies ListQueryPipeOptions<
  AdminUserRoleChangeAuditsSortField,
  AdminUserRoleChangeAuditsFilterField
>;

const listUserAccountDeletionAuditsQueryOptions = {
  sort: {
    allowed: {
      createdAt: { type: 'datetime' },
      id: { type: 'uuid' },
    },
    default: [{ field: 'createdAt', direction: 'desc' }],
    tieBreaker: { field: 'id', direction: 'desc' },
  },
  filters: {
    actorUserId: { type: 'uuid', ops: ['eq'] },
    targetUserId: { type: 'uuid', ops: ['eq'] },
    action: {
      type: 'enum',
      ops: ['eq', 'in'],
      enumValues: ['REQUESTED', 'CANCELED', 'FINALIZED', 'FINALIZE_BLOCKED_LAST_ADMIN'],
    },
    createdAt: { type: 'datetime', ops: ['gte', 'lte'] },
    traceId: { type: 'string', ops: ['eq'] },
  },
} as const satisfies ListQueryPipeOptions<
  AdminUserAccountDeletionAuditsSortField,
  AdminUserAccountDeletionAuditsFilterField
>;

@ApiTags('Admin')
@Controller('admin/audit')
@UseDbRoles()
@UseGuards(AccessTokenGuard, RbacGuard)
@RequirePermissions('admin:access')
@ApiBearerAuth('access-token')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get('user-role-changes')
  @RequirePermissions('audit:user-role-changes:read')
  @ApiOperation({
    operationId: 'admin.audit.userRoleChanges.list',
    summary: 'List user role changes',
    description:
      'Lists role change audit events. Filter by traceId to locate the exact change request.',
  })
  @ApiListQuery(listUserRoleChangeAuditsQueryOptions)
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AdminUserRoleChangeAuditsListEnvelopeDto })
  async listUserRoleChangeAudits(
    @ListQueryParam(listUserRoleChangeAuditsQueryOptions)
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ) {
    return this.audit.listUserRoleChangeAudits(query);
  }

  @Get('user-account-deletions')
  @RequirePermissions('audit:user-account-deletions:read')
  @ApiOperation({
    operationId: 'admin.audit.userAccountDeletions.list',
    summary: 'List user account deletion events',
    description:
      'Lists account deletion audit events (request/cancel/finalization). ID-only; filter by traceId to locate the originating request/job.',
  })
  @ApiListQuery(listUserAccountDeletionAuditsQueryOptions)
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AdminUserAccountDeletionAuditsListEnvelopeDto })
  async listUserAccountDeletionAudits(
    @ListQueryParam(listUserAccountDeletionAuditsQueryOptions)
    query: ListQuery<
      AdminUserAccountDeletionAuditsSortField,
      AdminUserAccountDeletionAuditsFilterField
    >,
  ) {
    return this.audit.listUserAccountDeletionAudits(query);
  }
}
