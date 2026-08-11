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
import { AuthPasswordAuthService } from './password-auth.service';
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
import { AuthEmailVerificationJobs } from '../email-verification/email-verification.jobs';
import { UsersService } from '../../users/app/users.service';
import { AuthResultWithMeEnvelopeDto } from '../shared/auth.dto';
import {
  ChangePasswordRequestDto,
  PasswordLoginRequestDto,
  PasswordRegisterRequestDto,
} from './password-auth.dto';
import { AuthErrorFilter } from '../shared/auth-error.filter';
import { runBestEffort } from '../../../platform/logging/best-effort';

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class PasswordAuthController {
  constructor(
    private readonly auth: AuthPasswordAuthService,
    private readonly users: UsersService,
    private readonly emailVerificationJobs: AuthEmailVerificationJobs,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PasswordAuthController.name);
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
}
