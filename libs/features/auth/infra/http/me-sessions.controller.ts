import {
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
import { AuthSessionsService } from '../../app/auth-sessions.service';
import { AuthError } from '../../app/auth.errors';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiListQuery } from '../../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import type { ListQuery } from '../../../../shared/list-query';
import type { ListQueryPipeOptions } from '../../../../platform/http/list-query/list-query.pipe';
import type { UserSessionsSortField } from '../../app/ports/auth.repository';
import { MeSessionIdParamDto, MeSessionsListEnvelopeDto } from './dtos/me-sessions.dto';
import { AuthErrorFilter } from './auth-error.filter';

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
