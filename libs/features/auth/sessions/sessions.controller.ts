import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthSessionsService } from './sessions.service';
import { AuthSessionLifecycleService } from '../sessions/session-lifecycle.service';
import { AuthError } from '../shared/auth.errors';
import { AccessTokenGuard } from '../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../platform/auth/auth.types';
import { ApiErrorCodes } from '../../../platform/http/openapi/api-error-codes.decorator';
import { ErrorCode } from '../../../platform/http/errors/error-codes';
import { ApiListQuery } from '../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../platform/http/list-query/list-query.decorator';
import type { ListQuery } from '../../../shared/list-query';
import type { ListQueryPipeOptions } from '../../../platform/http/list-query/list-query.pipe';
import type { UserSessionsSortField } from '../shared/ports/auth.repository';
import {
  ClientContext,
  type ClientContextValue,
} from '../../../platform/http/request-context.decorator';
import { AuthResultEnvelopeDto } from '../shared/auth.dto';
import {
  LogoutRequestDto,
  MeSessionIdParamDto,
  MeSessionsListEnvelopeDto,
  RefreshRequestDto,
} from './sessions.dto';
import { AuthErrorFilter } from '../shared/auth-error.filter';
import { AuthErrorCode } from '../shared/auth.errors';

const listSessionsQueryOptions = {
  defaultLimit: 25,
  maxLimit: 100,
  sort: {
    allowed: {
      createdAt: { type: 'datetime' },
      id: { type: 'uuid' },
    },
    default: [{ field: 'createdAt', direction: 'desc' }],
    tieBreaker: { field: 'id', direction: 'desc' },
  },
} as const satisfies ListQueryPipeOptions<UserSessionsSortField, never>;

@ApiTags('Users')
@Controller()
@UseFilters(AuthErrorFilter)
export class MeSessionsController {
  constructor(private readonly sessions: AuthSessionsService) {}

  @Get('me/sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.sessions.list',
    summary: 'List current user sessions',
    description:
      'Lists all sessions (active, revoked, expired) for the authenticated user. Revoked sessions have refresh tokens revoked; access tokens remain valid until expiry.',
  })
  @ApiListQuery(listSessionsQueryOptions)
  @ApiErrorCodes([ErrorCode.VALIDATION_FAILED, ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: MeSessionsListEnvelopeDto })
  async listMySessions(
    @CurrentPrincipal() principal: AuthPrincipal,
    @ListQueryParam(listSessionsQueryOptions) query: ListQuery<UserSessionsSortField, never>,
  ) {
    return await this.sessions.listMySessions(principal.userId, principal.sessionId, query);
  }

  @Post('me/sessions/:sessionId/revoke')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.sessions.revoke',
    summary: 'Revoke a session (current user)',
    description: 'Revokes the given session and its refresh tokens. Idempotent.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeMySession(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: MeSessionIdParamDto,
  ): Promise<void> {
    const res = await this.sessions.revokeMySession(principal.userId, params.sessionId);
    if (res.kind === 'not_found') {
      throw new AuthError({
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: 'Session not found',
      });
    }
  }
}

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class AuthSessionsController {
  constructor(private readonly sessionLifecycle: AuthSessionLifecycleService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'auth.refresh',
    summary: 'Refresh tokens',
    description: 'Rotates the refresh token and returns a new access + refresh token.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
    AuthErrorCode.AUTH_SESSION_REVOKED,
    AuthErrorCode.AUTH_USER_SUSPENDED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async refresh(@Body() body: RefreshRequestDto, @ClientContext() client: ClientContextValue) {
    return await this.sessionLifecycle.refresh({
      refreshToken: body.refreshToken,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'auth.logout',
    summary: 'Logout',
    description: 'Revokes the session associated with the provided refresh token.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  async logout(@Body() body: LogoutRequestDto) {
    await this.sessionLifecycle.logout({ refreshToken: body.refreshToken });
  }
}
