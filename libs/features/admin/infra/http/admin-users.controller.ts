import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { AdminErrorCode } from '../../app/admin.error-codes';
import { AdminError } from '../../app/admin.errors';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiListQuery } from '../../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import type { ListQuery } from '../../../../shared/list-query';
import { RbacGuard } from '../../../../platform/rbac/rbac.guard';
import { RequirePermissions } from '../../../../platform/rbac/rbac.decorator';
import { UseDbRoles } from '../../../../platform/rbac/use-db-roles.decorator';
import type { ListQueryPipeOptions } from '../../../../platform/http/list-query/list-query.pipe';
import type { AdminUsersFilterField, AdminUsersSortField } from '../../app/admin-users.types';
import { AdminUsersService } from '../../app/admin-users.service';
import { AdminUserEnvelopeDto, AdminUsersListEnvelopeDto } from './dtos/admin-users.dto';
import { AdminUserIdParamDto, SetAdminUserRoleRequestDto } from './dtos/admin-user-role.dto';
import { SetAdminUserStatusRequestDto } from './dtos/admin-user-status.dto';

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
@UseDbRoles()
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
    const res = await this.users.listUsers(query);
    return {
      data: [...res.items],
      meta: {
        limit: res.limit,
        hasMore: res.hasMore,
        ...(res.nextCursor ? { nextCursor: res.nextCursor } : {}),
      },
    };
  }

  @Patch('users/:userId/role')
  @RequirePermissions('users:role:write')
  @ApiOperation({
    operationId: 'admin.users.role.patch',
    summary: 'Set user role',
    description:
      'Sets the user role. For /v1/admin/* endpoints, RBAC roles are hydrated from the database on every request (promotion/demotion takes effect immediately).',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    AdminErrorCode.ADMIN_CANNOT_DEMOTE_LAST_ADMIN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AdminUserEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'admin.users.role.patch' })
  async setUserRole(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
    @Param() params: AdminUserIdParamDto,
    @Body() body: SetAdminUserRoleRequestDto,
  ) {
    try {
      const user = await this.users.setUserRole({
        actorUserId: principal.userId,
        actorSessionId: principal.sessionId,
        traceId: req.requestId ?? 'unknown',
        targetUserId: params.userId,
        role: body.role,
      });
      return { data: user };
    } catch (err: unknown) {
      throw this.mapAdminError(err);
    }
  }

  @Patch('users/:userId/status')
  @RequirePermissions('users:status:write')
  @ApiOperation({
    operationId: 'admin.users.status.patch',
    summary: 'Set user status',
    description:
      'Sets the user status (ACTIVE/SUSPENDED). Suspended users cannot refresh tokens and are blocked from /v1/admin/* endpoints immediately.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    AdminErrorCode.ADMIN_CANNOT_SUSPEND_LAST_ADMIN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AdminUserEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'admin.users.status.patch' })
  async setUserStatus(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
    @Param() params: AdminUserIdParamDto,
    @Body() body: SetAdminUserStatusRequestDto,
  ) {
    try {
      const user = await this.users.setUserStatus({
        actorUserId: principal.userId,
        actorSessionId: principal.sessionId,
        traceId: req.requestId ?? 'unknown',
        targetUserId: params.userId,
        status: body.status,
        reason: body.reason,
        now: new Date(),
      });
      return { data: user };
    } catch (err: unknown) {
      throw this.mapAdminError(err);
    }
  }

  private mapAdminError(err: unknown): ProblemException {
    if (err instanceof AdminError) {
      return new ProblemException(err.status, {
        title: this.titleForStatus(err.status, err.code),
        detail: err.message,
        code: err.code,
        errors: err.issues ? [...err.issues] : undefined,
      });
    }
    throw err;
  }

  private titleForStatus(status: number, code: string): string {
    if (code === ErrorCode.VALIDATION_FAILED) return 'Validation Failed';

    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
