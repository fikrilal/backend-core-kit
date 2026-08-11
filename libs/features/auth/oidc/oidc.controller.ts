import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { AuthOidcAuthService } from './oidc-auth.service';
import { AuthErrorCode } from '../shared/auth.error-codes';
import { AccessTokenGuard } from '../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../platform/auth/auth.types';
import { ErrorCode } from '../../../platform/http/errors/error-codes';
import {
  ClientContext,
  type ClientContextValue,
} from '../../../platform/http/request-context.decorator';
import { Idempotent } from '../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../platform/http/openapi/api-error-codes.decorator';
import { UsersService } from '../../users/app/users.service';
import { AuthResultWithMeEnvelopeDto } from '../shared/auth.dto';
import { OidcConnectRequestDto, OidcExchangeRequestDto } from './oidc.dto';
import { AuthErrorFilter } from '../shared/auth-error.filter';

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class OidcController {
  constructor(
    private readonly auth: AuthOidcAuthService,
    private readonly users: UsersService,
  ) {}

  @Post('oidc/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'auth.oidc.exchange',
    summary: 'Exchange OIDC id_token',
    description:
      'Verifies an OIDC id_token (e.g., Google) and issues first-party access + refresh tokens. Does not auto-link to an existing password account purely by email.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_OIDC_NOT_CONFIGURED,
    AuthErrorCode.AUTH_OIDC_TOKEN_INVALID,
    AuthErrorCode.AUTH_OIDC_EMAIL_NOT_VERIFIED,
    AuthErrorCode.AUTH_OIDC_LINK_REQUIRED,
    AuthErrorCode.AUTH_USER_SUSPENDED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultWithMeEnvelopeDto })
  async exchangeOidc(
    @Body() body: OidcExchangeRequestDto,
    @ClientContext() client: ClientContextValue,
  ) {
    const result = await this.auth.exchangeOidc({
      provider: body.provider,
      idToken: body.idToken,
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    const user = await this.users.getMe(result.user.id);
    return { ...result, user };
  }

  @Post('oidc/connect')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'auth.oidc.connect',
    summary: 'Connect OIDC identity (current user)',
    description:
      'Links an OIDC identity (e.g., Google) to the authenticated user. If the OIDC email matches the user email, the user email is marked verified.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    AuthErrorCode.AUTH_OIDC_NOT_CONFIGURED,
    AuthErrorCode.AUTH_OIDC_TOKEN_INVALID,
    AuthErrorCode.AUTH_OIDC_EMAIL_NOT_VERIFIED,
    AuthErrorCode.AUTH_OIDC_IDENTITY_ALREADY_LINKED,
    AuthErrorCode.AUTH_OIDC_PROVIDER_ALREADY_LINKED,
    ErrorCode.INTERNAL,
  ])
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'auth.oidc.connect' })
  @ApiNoContentResponse()
  async connectOidc(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: OidcConnectRequestDto,
  ): Promise<void> {
    await this.auth.connectOidc({
      userId: principal.userId,
      provider: body.provider,
      idToken: body.idToken,
    });
  }
}
