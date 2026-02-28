import { Body, Controller, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from '../../app/auth.service';
import { AuthError } from '../../app/auth.errors';
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
import { AuthEmailVerificationJobs } from '../jobs/auth-email-verification.jobs';
import { AuthPasswordResetJobs } from '../jobs/auth-password-reset.jobs';
import { RedisEmailVerificationRateLimiter } from '../rate-limit/redis-email-verification-rate-limiter';
import { RedisPasswordResetRateLimiter } from '../rate-limit/redis-password-reset-rate-limiter';
import { UsersService } from '../../../users/app/users.service';
import {
  AuthResultEnvelopeDto,
  AuthResultWithMeEnvelopeDto,
  ChangePasswordRequestDto,
  LogoutRequestDto,
  OidcConnectRequestDto,
  OidcExchangeRequestDto,
  PasswordResetConfirmRequestDto,
  PasswordLoginRequestDto,
  PasswordRegisterRequestDto,
  PasswordResetRequestDto,
  RefreshRequestDto,
  VerifyEmailRequestDto,
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
    private readonly emailVerificationRateLimiter: RedisEmailVerificationRateLimiter,
    private readonly passwordResetJobs: AuthPasswordResetJobs,
    private readonly passwordResetRateLimiter: RedisPasswordResetRateLimiter,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Post('password/register')
  @HttpCode(200)
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
  @HttpCode(200)
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
  @HttpCode(204)
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

  @Post('email/verify')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.email.verify',
    summary: 'Verify email',
    description: 'Verifies a user email using a token sent via email.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_INVALID,
    AuthErrorCode.AUTH_EMAIL_VERIFICATION_TOKEN_EXPIRED,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  async verifyEmail(@Body() body: VerifyEmailRequestDto): Promise<void> {
    await this.auth.verifyEmail({ token: body.token });
  }

  @Post('email/verification/resend')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.email.verification.resend',
    summary: 'Resend verification email (current user)',
    description: 'Enqueues a new verification email for the authenticated user (rate limited).',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.RATE_LIMITED, ErrorCode.INTERNAL])
  @ApiNoContentResponse()
  async resendVerificationEmail(
    @CurrentPrincipal() principal: AuthPrincipal,
    @ClientContext() client: ClientContextValue,
  ): Promise<void> {
    if (!this.emailVerificationJobs.isEnabled()) {
      throw new AuthError({
        status: 500,
        code: ErrorCode.INTERNAL,
        message: 'Email is not configured',
      });
    }

    const status = await this.auth.getEmailVerificationStatus(principal.userId);
    if (status === 'verified') return;

    await this.emailVerificationRateLimiter.assertResendAllowed({
      userId: principal.userId,
      ip: client.ip,
    });

    const enqueued = await this.emailVerificationJobs.enqueueSendVerificationEmail(
      principal.userId,
    );
    if (!enqueued) {
      throw new AuthError({
        status: 500,
        code: ErrorCode.INTERNAL,
        message: 'Email is not configured',
      });
    }
  }

  @Post('password/reset/request')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.password.reset.request',
    summary: 'Request password reset',
    description:
      'Enqueues a password reset email for an existing user. Returns 204 even if the email is unknown to avoid account enumeration.',
  })
  @ApiErrorCodes([ErrorCode.VALIDATION_FAILED, ErrorCode.RATE_LIMITED, ErrorCode.INTERNAL])
  @ApiNoContentResponse()
  async requestPasswordReset(
    @Body() body: PasswordResetRequestDto,
    @ClientContext() client: ClientContextValue,
  ): Promise<void> {
    if (!this.passwordResetJobs.isEnabled()) {
      throw new AuthError({
        status: 500,
        code: ErrorCode.INTERNAL,
        message: 'Password reset email is not configured',
      });
    }

    await this.passwordResetRateLimiter.assertRequestAllowed({
      email: body.email,
      ip: client.ip,
    });

    const target = await this.auth.requestPasswordReset({ email: body.email });
    if (!target) return;

    await runBestEffort({
      logger: this.logger,
      operation: 'auth.enqueuePasswordResetEmail',
      context: { userId: target.userId },
      run: async () => {
        await this.passwordResetJobs.enqueueSendPasswordResetEmail(target.userId);
      },
    });
  }

  @Post('password/reset/confirm')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.password.reset.confirm',
    summary: 'Confirm password reset',
    description: 'Resets the user password using a one-time token and revokes all sessions.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_PASSWORD_RESET_TOKEN_INVALID,
    AuthErrorCode.AUTH_PASSWORD_RESET_TOKEN_EXPIRED,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  async confirmPasswordReset(@Body() body: PasswordResetConfirmRequestDto): Promise<void> {
    await this.auth.confirmPasswordReset({ token: body.token, newPassword: body.newPassword });
  }

  @Post('password/login')
  @HttpCode(200)
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
  @HttpCode(204)
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
  @HttpCode(200)
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
  @HttpCode(204)
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
