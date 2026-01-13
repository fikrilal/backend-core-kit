import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { AuthEmailVerificationJobs } from '../jobs/auth-email-verification.jobs';
import { AuthPasswordResetJobs } from '../jobs/auth-password-reset.jobs';
import { RedisEmailVerificationRateLimiter } from '../rate-limit/redis-email-verification-rate-limiter';
import { RedisPasswordResetRateLimiter } from '../rate-limit/redis-password-reset-rate-limiter';
import {
  AuthResultEnvelopeDto,
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

const SESSION_USER_AGENT_MAX_LENGTH = 512;

function normalizeUserAgent(value: unknown): string | undefined {
  const raw = (() => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return undefined;
  })();

  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  return trimmed.length <= SESSION_USER_AGENT_MAX_LENGTH
    ? trimmed
    : trimmed.slice(0, SESSION_USER_AGENT_MAX_LENGTH);
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
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
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async register(@Body() body: PasswordRegisterRequestDto, @Req() req: FastifyRequest) {
    try {
      const result = await this.auth.registerWithPassword({
        email: body.email,
        password: body.password,
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        ip: req.ip,
        userAgent: normalizeUserAgent(req.headers['user-agent']),
      });

      try {
        await this.emailVerificationJobs.enqueueSendVerificationEmail(result.user.id);
      } catch (err: unknown) {
        this.logger.error(
          { err, userId: result.user.id },
          'Failed to enqueue verification email job',
        );
      }

      return result;
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async exchangeOidc(@Body() body: OidcExchangeRequestDto, @Req() req: FastifyRequest) {
    try {
      return await this.auth.exchangeOidc({
        provider: body.provider,
        idToken: body.idToken,
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        ip: req.ip,
        userAgent: normalizeUserAgent(req.headers['user-agent']),
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      await this.auth.connectOidc({
        userId: principal.userId,
        provider: body.provider,
        idToken: body.idToken,
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      await this.auth.verifyEmail({ token: body.token });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    @Req() req: FastifyRequest,
  ): Promise<void> {
    try {
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
        ip: req.ip,
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
    } catch (err: unknown) {
      throw this.mapAuthError(err);
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
    @Req() req: FastifyRequest,
  ): Promise<void> {
    try {
      if (!this.passwordResetJobs.isEnabled()) {
        throw new AuthError({
          status: 500,
          code: ErrorCode.INTERNAL,
          message: 'Password reset email is not configured',
        });
      }

      await this.passwordResetRateLimiter.assertRequestAllowed({ email: body.email, ip: req.ip });

      const target = await this.auth.requestPasswordReset({ email: body.email });
      if (!target) return;

      try {
        await this.passwordResetJobs.enqueueSendPasswordResetEmail(target.userId);
      } catch (err: unknown) {
        this.logger.error(
          { err, userId: target.userId },
          'Failed to enqueue password reset email job',
        );
      }
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      await this.auth.confirmPasswordReset({ token: body.token, newPassword: body.newPassword });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async login(@Body() body: PasswordLoginRequestDto, @Req() req: FastifyRequest) {
    try {
      return await this.auth.loginWithPassword({
        email: body.email,
        password: body.password,
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        ip: req.ip,
        userAgent: normalizeUserAgent(req.headers['user-agent']),
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      await this.auth.changePassword({
        userId: principal.userId,
        sessionId: principal.sessionId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
  async refresh(@Body() body: RefreshRequestDto, @Req() req: FastifyRequest) {
    try {
      return await this.auth.refresh({
        refreshToken: body.refreshToken,
        ip: req.ip,
        userAgent: normalizeUserAgent(req.headers['user-agent']),
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
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
    try {
      await this.auth.logout({ refreshToken: body.refreshToken });
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
      case 409:
        return 'Conflict';
      case 429:
        return 'Too Many Requests';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
