import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ApiListQuery } from '../../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import type { ListQuery } from '../../../../shared/list-query';
import { RbacGuard } from '../../../../platform/rbac/rbac.guard';
import { RequirePermissions } from '../../../../platform/rbac/rbac.decorator';
import type { ListQueryPipeOptions } from '../../../../platform/http/list-query/list-query.pipe';
import type { AdminUsersFilterField, AdminUsersSortField } from '../../app/admin-users.types';
import { AdminUsersService } from '../../app/admin-users.service';
import { AdminUsersListEnvelopeDto } from './dtos/admin-users.dto';

const listUsersQueryOptions = {
  search: true,
  sort: {
    allowed: {
      createdAt: { type: 'datetime' },
      email: { type: 'string' },
      id: { type: 'uuid' },
    },
    default: [{ field: 'createdAt', direction: 'desc' }],
    tieBreaker: { field: 'id', direction: 'asc' },
  },
  filters: {
    role: { type: 'enum', ops: ['eq', 'in'], enumValues: ['USER', 'ADMIN'] },
    emailVerified: { type: 'boolean', ops: ['eq'] },
    createdAt: { type: 'datetime', ops: ['gte', 'lte'] },
    email: { type: 'string', ops: ['eq'] },
  },
} as const satisfies ListQueryPipeOptions<AdminUsersSortField, AdminUsersFilterField>;

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AccessTokenGuard, RbacGuard)
@RequirePermissions('admin:access')
@ApiBearerAuth('access-token')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('users')
  @RequirePermissions('users:read')
  @ApiOperation({
    operationId: 'admin.users.list',
    summary: 'List users',
    description: 'Admin-only user listing with cursor pagination, sorting, filtering, and search.',
  })
  @ApiListQuery(listUsersQueryOptions)
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AdminUsersListEnvelopeDto })
  async listUsers(
    @ListQueryParam(listUsersQueryOptions)
    query: ListQuery<AdminUsersSortField, AdminUsersFilterField>,
  ) {
    return this.users.listUsers(query);
  }
}
