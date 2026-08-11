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
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from '../../app/auth.service';
import { AuthErrorCode } from '../../app/auth.error-codes';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import {
  ClientContext,
  type ClientContextValue,
} from '../../../../platform/http/request-context.decorator';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { AuthEmailVerificationJobs } from '../../email-verification/email-verification.jobs';
import { UsersService } from '../../../users/app/users.service';
import {
  AuthResultEnvelopeDto,
  AuthResultWithMeEnvelopeDto,
  ChangePasswordRequestDto,
  LogoutRequestDto,
  OidcConnectRequestDto,
  OidcExchangeRequestDto,
  PasswordLoginRequestDto,
  PasswordRegisterRequestDto,
  RefreshRequestDto,
} from './dtos/auth.dto';
import { AuthErrorFilter } from './auth-error.filter';
import { runBestEffort } from '../../../../platform/logging/best-effort';

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly emailVerificationJobs: AuthEmailVerificationJobs,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Post('password/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'auth.password.register',
    summary: 'Register (password)',
    description: 'Creates a user and immediately issues first-party access + refresh tokens.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultWithMeEnvelopeDto })
  async register(
    @Body() body: PasswordRegisterRequestDto,
    @ClientContext() client: ClientContextValue,
  ) {
    const result = await this.auth.registerWithPassword({
      email: body.email,
      password: body.password,
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    await runBestEffort({
      logger: this.logger,
      operation: 'auth.enqueueVerificationEmail',
      context: { userId: result.user.id },
      run: async () => {
        await this.emailVerificationJobs.enqueueSendVerificationEmail(result.user.id);
      },
    });

    const user = await this.users.getMe(result.user.id);
    return { ...result, user };
  }

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

  @Post('password/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'auth.password.login',
    summary: 'Login (password)',
    description: 'Authenticates a user and issues first-party access + refresh tokens.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    AuthErrorCode.AUTH_USER_SUSPENDED,
    ErrorCode.RATE_LIMITED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultWithMeEnvelopeDto })
  async login(@Body() body: PasswordLoginRequestDto, @ClientContext() client: ClientContextValue) {
    const result = await this.auth.loginWithPassword({
      email: body.email,
      password: body.password,
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    const user = await this.users.getMe(result.user.id);
    return { ...result, user };
  }

  @Post('password/change')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'auth.password.change',
    summary: 'Change password (current user)',
    description:
      'Changes the authenticated user password. Revokes other sessions (and their refresh tokens) but keeps the current session active.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    AuthErrorCode.AUTH_PASSWORD_NOT_SET,
    AuthErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
    ErrorCode.INTERNAL,
  ])
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'auth.password.change' })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    await this.auth.changePassword({
      userId: principal.userId,
      sessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }

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
    return await this.auth.refresh({
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
    await this.auth.logout({ refreshToken: body.refreshToken });
  }
}
