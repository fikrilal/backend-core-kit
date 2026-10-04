import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AccessTokenGuard } from '../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../platform/auth/auth.types';
import { ErrorCode } from '../../platform/http/errors/error-codes';
import { Idempotent } from '../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../platform/http/openapi/api-error-codes.decorator';
import { MerchantOnboardingErrorFilter } from './merchant-onboarding-error.filter';
import { MerchantOnboardingErrorCode } from './merchant-onboarding.errors';
import {
  MerchantReferenceDataEnvelopeDto,
  MerchantSubmitEnvelopeDto,
  MerchantOnboardingSubmitRequestDto,
  toMerchantOnboardingApplicationInput,
} from './merchant-onboarding.dto';
import type { MerchantOnboardingSubmitView } from './merchant-onboarding.model';
import type { MerchantOnboardingReferenceDataView } from './merchant-onboarding.reference-data';
import { MerchantOnboardingService } from './merchant-onboarding.service';

const MERCHANT_APPLICATIONS_BASE_PATH = '/v1/merchant-onboarding/applications';

@ApiTags('MerchantOnboarding')
@Controller('merchant-onboarding')
@UseFilters(MerchantOnboardingErrorFilter)
export class MerchantOnboardingController {
  constructor(private readonly service: MerchantOnboardingService) {}

  @Get('reference-data')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'merchantOnboarding.referenceData.get',
    summary: 'Get merchant onboarding reference data',
    description:
      'Returns the code-owned catalog snapshot (business types, industries, monthly sales ranges, owner roles, banks, account holder types, payout schedules) and the current terms version.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: MerchantReferenceDataEnvelopeDto })
  getReferenceData(): MerchantOnboardingReferenceDataView {
    return this.service.getReferenceData();
  }

  @Post('applications')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'merchantOnboarding.applications.submit',
    summary: 'Submit a merchant onboarding application',
    description:
      "Creates the authenticated user's single merchant application. Requires an Idempotency-Key; identical replays return the stored response with Idempotency-Replayed: true.",
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    ErrorCode.INTERNAL,
    MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_APPLICATION_ALREADY_EXISTS,
    MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REGISTRATION_ALREADY_EXISTS,
    MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_REFERENCE_DATA_STALE,
    MerchantOnboardingErrorCode.MERCHANT_ONBOARDING_TERMS_VERSION_STALE,
  ])
  @ApiCreatedResponse({ type: MerchantSubmitEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: true })
  @Idempotent({ scopeKey: 'merchant-onboarding.applications.submit', required: true })
  async submitApplication(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: MerchantOnboardingSubmitRequestDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MerchantOnboardingSubmitView> {
    reply.status(HttpStatus.CREATED);
    const result = await this.service.submitApplication({
      userId: principal.userId,
      request: toMerchantOnboardingApplicationInput(body),
    });
    reply.header('Location', `${MERCHANT_APPLICATIONS_BASE_PATH}/${result.applicationId}`);
    return result;
  }
}
