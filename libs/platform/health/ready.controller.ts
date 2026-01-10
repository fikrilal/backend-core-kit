import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../http/decorators/skip-envelope.decorator';
import { ErrorCode } from '../http/errors/error-codes';
import { ApiErrorCodes } from '../http/openapi/api-error-codes.decorator';
import { ReadinessService } from './readiness.service';

@ApiTags('Health')
@Controller('ready')
export class ReadyController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  @SkipEnvelope()
  @ApiOperation({
    operationId: 'ready.get',
    summary: 'Readiness check',
    description: 'Indicates whether the service is ready to receive traffic.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({
    description: 'Readiness check.',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', example: 'ok' } },
      required: ['status'],
    },
  })
  async getReady() {
    await this.readiness.assertReady();
    return { status: 'ok' };
  }
}
