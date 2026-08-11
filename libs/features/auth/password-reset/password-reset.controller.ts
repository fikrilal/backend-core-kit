import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { AuthErrorCode } from '../shared/auth.error-codes';
import { AuthError } from '../shared/auth.errors';
import { ErrorCode } from '../../../platform/http/errors/error-codes';
import {
  ClientContext,
  type ClientContextValue,
} from '../../../platform/http/request-context.decorator';
import { ApiErrorCodes } from '../../../platform/http/openapi/api-error-codes.decorator';
import { runBestEffort } from '../../../platform/logging/best-effort';
import { RedisPasswordResetRateLimiter } from '../shared/rate-limit/redis-password-reset-rate-limiter';
import { AuthErrorFilter } from '../shared/auth-error.filter';
import { PasswordResetConfirmRequestDto, PasswordResetRequestDto } from './password-reset.dto';
import { AuthPasswordResetJobs } from './password-reset.jobs';
import { AuthPasswordResetService } from './password-reset.service';

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class PasswordResetController {
  constructor(
    private readonly passwordReset: AuthPasswordResetService,
    private readonly passwordResetJobs: AuthPasswordResetJobs,
    private readonly passwordResetRateLimiter: RedisPasswordResetRateLimiter,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PasswordResetController.name);
  }

  @Post('password/reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
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

    const target = await this.passwordReset.requestPasswordReset({ email: body.email });
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
  @HttpCode(HttpStatus.NO_CONTENT)
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
    await this.passwordReset.confirmPasswordReset({
      token: body.token,
      newPassword: body.newPassword,
    });
  }
}
