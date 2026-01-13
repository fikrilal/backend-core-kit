import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { PROFILE_IMAGE_PRESIGN_TTL_SECONDS } from '../../app/profile-image.policy';
import { UserProfileImageService } from '../../app/user-profile-image.service';
import { UsersErrorCode } from '../../app/users.error-codes';
import { UserNotFoundError, UsersError } from '../../app/users.errors';
import {
  CompleteProfileImageUploadRequestDto,
  CreateProfileImageUploadRequestDto,
  ProfileImageUploadPlanEnvelopeDto,
} from './dtos/profile-image.dto';

@ApiTags('Users')
@Controller()
export class ProfileImageController {
  constructor(private readonly images: UserProfileImageService) {}

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
    try {
      return await this.images.createUploadPlan({
        userId: principal.userId,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        traceId: req.requestId ?? 'unknown',
      });
    } catch (err: unknown) {
      throw this.mapUsersError(err);
    }
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
    try {
      await this.images.completeUpload({
        userId: principal.userId,
        fileId: body.fileId,
        traceId: req.requestId ?? 'unknown',
      });
    } catch (err: unknown) {
      throw this.mapUsersError(err);
    }
  }

  private mapUsersError(err: unknown): ProblemException {
    if (err instanceof UserNotFoundError) {
      return new ProblemException(401, { title: 'Unauthorized', code: ErrorCode.UNAUTHORIZED });
    }

    if (err instanceof UsersError) {
      return new ProblemException(err.status, {
        title: this.titleForStatus(err.status, err.code),
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
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 501:
        return 'Not Implemented';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}
