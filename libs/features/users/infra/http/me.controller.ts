import { Body, Controller, Get, Patch, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../../app/users.service';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { MeEnvelopeDto, PatchMeRequestDto } from './dtos/me.dto';
import { UsersErrorFilter } from './users-error.filter';

@ApiTags('Users')
@Controller()
@UseFilters(UsersErrorFilter)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.get',
    summary: 'Get current user',
    description: 'Returns the authenticated user profile.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: MeEnvelopeDto })
  async getMe(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.users.getMe(principal.userId);
  }

  @Patch('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.patch',
    summary: 'Update current user profile',
    description:
      'Partially updates the authenticated user profile. Omitted fields are unchanged; null clears a field.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: MeEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'users.me.patch' })
  async patchMe(@CurrentPrincipal() principal: AuthPrincipal, @Body() body: PatchMeRequestDto) {
    return this.users.updateMeProfile(principal.userId, body.profile);
  }
}
