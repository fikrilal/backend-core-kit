import { Controller, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { RequestTraceId } from '../../../../platform/http/request-context.decorator';
import { UsersErrorCode } from '../../app/users.error-codes';
import { UsersService } from '../../app/users.service';
import { UserAccountDeletionEmailJobs } from '../jobs/user-account-deletion-email.jobs';
import { UsersErrorFilter } from './users-error.filter';
import { runBestEffort } from '../../../../platform/logging/best-effort';

@ApiTags('Users')
@Controller()
@UseFilters(UsersErrorFilter)
export class UserAccountDeletionController {
  constructor(
    private readonly users: UsersService,
    private readonly emails: UserAccountDeletionEmailJobs,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAccountDeletionController.name);
  }

  @Post('me/account-deletion/request')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'users.me.accountDeletion.request',
    summary: 'Request account deletion (30-day grace)',
    description:
      'Schedules account deletion 30 days in the future. The account remains usable during the grace period and the request can be canceled. After the grace period, the account is de-identified (PII erased) and the email becomes reusable.',
  })
  @ApiErrorCodes([
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    UsersErrorCode.USERS_CANNOT_DELETE_LAST_ADMIN,
    ErrorCode.INTERNAL,
  ])
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'users.me.accountDeletion.request' })
  @ApiNoContentResponse()
  async requestDeletion(
    @CurrentPrincipal() principal: AuthPrincipal,
    @RequestTraceId() traceId: string,
  ): Promise<void> {
    const result = await this.users.requestAccountDeletion({
      userId: principal.userId,
      sessionId: principal.sessionId,
      traceId,
    });

    // Notifications are best-effort and must not affect the API result.
    if (result.newlyRequested) {
      await runBestEffort({
        logger: this.logger,
        operation: 'users.enqueueAccountDeletionRequestedEmail',
        context: { userId: principal.userId },
        run: async () => {
          await this.emails.enqueueDeletionRequestedEmail(principal.userId, result.scheduledFor);
        },
      });
    }

    await runBestEffort({
      logger: this.logger,
      operation: 'users.scheduleAccountDeletionReminderEmail',
      context: { userId: principal.userId },
      run: async () => {
        await this.emails.scheduleDeletionReminderEmail(principal.userId, result.scheduledFor);
      },
    });
  }

  @Post('me/account-deletion/cancel')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'users.me.accountDeletion.cancel',
    summary: 'Cancel account deletion',
    description: 'Cancels a previously scheduled account deletion request.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.IDEMPOTENCY_IN_PROGRESS, ErrorCode.INTERNAL])
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'users.me.accountDeletion.cancel' })
  @ApiNoContentResponse()
  async cancelDeletion(
    @CurrentPrincipal() principal: AuthPrincipal,
    @RequestTraceId() traceId: string,
  ): Promise<void> {
    await this.users.cancelAccountDeletion({
      userId: principal.userId,
      sessionId: principal.sessionId,
      traceId,
    });

    // Best-effort cleanup.
    await runBestEffort({
      logger: this.logger,
      operation: 'users.cancelAccountDeletionReminderEmail',
      context: { userId: principal.userId },
      run: async () => {
        await this.emails.cancelDeletionReminderEmail(principal.userId);
      },
    });
  }
}
