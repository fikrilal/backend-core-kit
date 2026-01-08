import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../http/decorators/skip-envelope.decorator';
import { ErrorCode } from '../http/errors/error-codes';
import { ApiErrorCodes } from '../http/openapi/api-error-codes.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @SkipEnvelope()
  @ApiOperation({
    operationId: 'health.get',
    summary: 'Liveness check',
    description: 'Indicates whether the process is alive.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({
    description: 'Liveness check.',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', example: 'ok' } },
      required: ['status'],
    },
  })
  getHealth() {
    return { status: 'ok' };
  }
}
