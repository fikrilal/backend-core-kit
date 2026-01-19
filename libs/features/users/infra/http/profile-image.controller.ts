import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { PROFILE_IMAGE_PRESIGN_TTL_SECONDS } from '../../app/profile-image.policy';
import type { ProfileImageUrlView } from '../../app/user-profile-image.service';
import { UserProfileImageService } from '../../app/user-profile-image.service';
import { UsersErrorCode } from '../../app/users.error-codes';
import { ProfileImageCleanupJobs } from '../jobs/profile-image-cleanup.jobs';
import { RedisProfileImageUploadRateLimiter } from '../rate-limit/redis-profile-image-upload-rate-limiter';
import {
  CompleteProfileImageUploadRequestDto,
  CreateProfileImageUploadRequestDto,
  ProfileImageUploadPlanEnvelopeDto,
  ProfileImageUrlEnvelopeDto,
} from './dtos/profile-image.dto';
import { UsersErrorFilter } from './users-error.filter';

@ApiTags('Users')
@Controller()
@UseFilters(UsersErrorFilter)
export class ProfileImageController {
  constructor(
    private readonly images: UserProfileImageService,
    private readonly rateLimiter: RedisProfileImageUploadRateLimiter,
    private readonly jobs: ProfileImageCleanupJobs,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ProfileImageController.name);
  }

  @Post('me/profile-image/upload')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'users.me.profileImage.upload',
    summary: 'Create a profile image upload plan (presigned URL)',
    description:
      'Creates an upload record and returns a short-lived presigned URL for direct upload to object storage.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.RATE_LIMITED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: ProfileImageUploadPlanEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({
    scopeKey: 'users.me.profileImage.upload',
    ttlSeconds: PROFILE_IMAGE_PRESIGN_TTL_SECONDS,
  })
  async createUploadPlan(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
    @Body() body: CreateProfileImageUploadRequestDto,
  ) {
    await this.rateLimiter.assertAllowed({ userId: principal.userId, ip: req.ip });
    const plan = await this.images.createUploadPlan({
      userId: principal.userId,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      traceId: req.requestId ?? 'unknown',
    });

    try {
      await this.jobs.scheduleExpireUpload(principal.userId, plan.fileId);
    } catch (err: unknown) {
      this.logger.error(
        { err, userId: principal.userId, fileId: plan.fileId },
        'Failed to schedule profile image upload expiry job',
      );
    }

    return plan;
  }

  @Post('me/profile-image/complete')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'users.me.profileImage.complete',
    summary: 'Finalize a profile image upload',
    description: 'Verifies the uploaded object and attaches it to the current user profile.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
    UsersErrorCode.USERS_PROFILE_IMAGE_NOT_UPLOADED,
    UsersErrorCode.USERS_PROFILE_IMAGE_SIZE_MISMATCH,
    UsersErrorCode.USERS_PROFILE_IMAGE_CONTENT_TYPE_MISMATCH,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  async completeUpload(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
    @Body() body: CompleteProfileImageUploadRequestDto,
  ): Promise<void> {
    const previousFileId = await this.images.completeUpload({
      userId: principal.userId,
      fileId: body.fileId,
      traceId: req.requestId ?? 'unknown',
    });

    if (previousFileId) {
      try {
        await this.jobs.enqueueDeleteStoredFile(principal.userId, previousFileId);
      } catch (err: unknown) {
        this.logger.error(
          { err, userId: principal.userId, fileId: previousFileId },
          'Failed to enqueue profile image cleanup job',
        );
      }
    }
  }

  @Delete('me/profile-image')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'users.me.profileImage.clear',
    summary: 'Clear current profile image',
    description:
      'Detaches the current profile image (if any) and marks the stored file deleted. Object storage deletion is best-effort.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiNoContentResponse()
  async clearProfileImage(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const clearedFileId = await this.images.clearProfileImage({
      userId: principal.userId,
      traceId: req.requestId ?? 'unknown',
    });

    if (clearedFileId) {
      try {
        await this.jobs.enqueueDeleteStoredFile(principal.userId, clearedFileId);
      } catch (err: unknown) {
        this.logger.error(
          { err, userId: principal.userId, fileId: clearedFileId },
          'Failed to enqueue profile image cleanup job',
        );
      }
    }
  }

  @Get('me/profile-image/url')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.profileImage.url',
    summary: 'Get current profile image URL',
    description:
      'Returns a short-lived presigned URL for rendering the current profile image. Returns 204 when no profile image is set.',
  })
  @ApiErrorCodes([
    ErrorCode.UNAUTHORIZED,
    UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: ProfileImageUrlEnvelopeDto })
  @ApiNoContentResponse()
  async getProfileImageUrl(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProfileImageUrlView | undefined> {
    const url = await this.images.getProfileImageUrl({
      userId: principal.userId,
      traceId: req.requestId ?? 'unknown',
    });

    if (!url) {
      reply.status(204);
      return undefined;
    }

    return url;
  }
}
