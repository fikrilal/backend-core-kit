import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { RbacGuard } from '../../../../platform/rbac/rbac.guard';
import { RequirePermissions } from '../../../../platform/rbac/rbac.decorator';
import { AdminWhoamiEnvelopeDto } from './dtos/whoami.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminWhoamiController {
  @Get('whoami')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('admin:access')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'admin.whoami.get',
    summary: 'Get current principal (admin)',
    description: 'Returns the authenticated principal as derived from the access token.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: AdminWhoamiEnvelopeDto })
  getWhoami(@CurrentPrincipal() principal: AuthPrincipal) {
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      emailVerified: principal.emailVerified,
      roles: [...principal.roles],
    };
  }
}
