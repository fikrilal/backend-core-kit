import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthPushTokensService } from '../../app/auth-push-tokens.service';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { PUSH_SERVICE } from '../../../../platform/push/push.tokens';
import type { PushService } from '../../../../platform/push/push.service';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { MePushTokenUpsertRequestDto } from './dtos/me-push-token.dto';
import { AuthErrorFilter } from './auth-error.filter';

const PUSH_NOT_CONFIGURED_CODE = 'PUSH_NOT_CONFIGURED';

@ApiTags('Users')
@Controller()
@UseFilters(AuthErrorFilter)
export class MePushTokenController {
  constructor(
    private readonly pushTokens: AuthPushTokensService,
    @Inject(PUSH_SERVICE) private readonly push: PushService,
  ) {}

  @Put('me/push-token')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.pushToken.upsert',
    summary: 'Register/update push token (current session)',
    description:
      'Stores the FCM registration token for the current session. Idempotent; replaces any existing token for the session.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    PUSH_NOT_CONFIGURED_CODE,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async upsertMyPushToken(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: MePushTokenUpsertRequestDto,
  ): Promise<void> {
    if (!this.push.isEnabled()) {
      throw new ProblemException(501, {
        title: 'Not Implemented',
        code: PUSH_NOT_CONFIGURED_CODE,
        detail: 'Push provider is not configured',
      });
    }

    await this.pushTokens.upsertMyPushToken({
      userId: principal.userId,
      sessionId: principal.sessionId,
      platform: body.platform,
      token: body.token,
    });
  }

  @Delete('me/push-token')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.pushToken.revoke',
    summary: 'Revoke push token (current session)',
    description: 'Clears the stored push token for the current session. Idempotent.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeMyPushToken(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    await this.pushTokens.revokeMyPushToken({
      userId: principal.userId,
      sessionId: principal.sessionId,
    });
  }
}
