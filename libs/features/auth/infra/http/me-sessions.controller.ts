import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
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
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { ApiListQuery } from '../../../../platform/http/list-query/api-list-query.decorator';
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import type { ListQuery } from '../../../../shared/list-query';
import type { ListQueryPipeOptions } from '../../../../platform/http/list-query/list-query.pipe';
import type { UserSessionsSortField } from '../../app/ports/auth.repository';
import { MeSessionIdParamDto, MeSessionsListEnvelopeDto } from './dtos/me-sessions.dto';

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
    try {
      return await this.sessions.listMySessions(principal.userId, principal.sessionId, query);
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      const res = await this.sessions.revokeMySession(principal.userId, params.sessionId);
      if (res.kind === 'not_found') {
        throw new AuthError({
          status: 404,
          code: ErrorCode.NOT_FOUND,
          message: 'Session not found',
        });
      }
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  private mapAuthError(err: unknown): ProblemException {
    if (err instanceof AuthError) {
      const title = this.titleForStatus(err.status, err.code);
      return new ProblemException(err.status, {
        title,
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
      case 429:
        return 'Too Many Requests';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
