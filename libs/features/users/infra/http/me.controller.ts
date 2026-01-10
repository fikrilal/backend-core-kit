import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../../app/users.service';
import { UserNotFoundError } from '../../app/users.errors';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { MeEnvelopeDto } from './dtos/me.dto';

@ApiTags('Users')
@Controller()
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
    try {
      return await this.users.getMe(principal.userId);
    } catch (err: unknown) {
      if (err instanceof UserNotFoundError) {
        // Treat missing subject as an invalid principal (token is not usable).
        throw new ProblemException(401, { title: 'Unauthorized', code: ErrorCode.UNAUTHORIZED });
      }
      throw err;
    }
  }
}
