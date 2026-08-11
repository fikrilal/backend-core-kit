import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthErrorCode } from '../app/auth.error-codes';
import { AuthError } from '../app/auth.errors';
import { AccessTokenGuard } from '../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../platform/auth/auth.types';
import { ErrorCode } from '../../../platform/http/errors/error-codes';
import {
  ClientContext,
  type ClientContextValue,
} from '../../../platform/http/request-context.decorator';
import { ApiErrorCodes } from '../../../platform/http/openapi/api-error-codes.decorator';
import { RedisEmailVerificationRateLimiter } from '../infra/rate-limit/redis-email-verification-rate-limiter';
import { AuthErrorFilter } from '../infra/http/auth-error.filter';
import { VerifyEmailRequestDto } from './email-verification.dto';
import { AuthEmailVerificationJobs } from './email-verification.jobs';
import { AuthEmailVerificationService } from './email-verification.service';

@ApiTags('Auth')
@Controller('auth')
@UseFilters(AuthErrorFilter)
export class EmailVerificationController {
  constructor(
    private readonly emailVerification: AuthEmailVerificationService,
    private readonly emailVerificationJobs: AuthEmailVerificationJobs,
    private readonly emailVerificationRateLimiter: RedisEmailVerificationRateLimiter,
  ) {}

  @Post('email/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
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
    await this.emailVerification.verifyEmail({ token: body.token });
  }

  @Post('email/verification/resend')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
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

    const status = await this.emailVerification.getEmailVerificationStatus(principal.userId);
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
}
