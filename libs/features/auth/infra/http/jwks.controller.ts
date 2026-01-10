import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../app/auth.service';
import { SkipEnvelope } from '../../../../platform/http/decorators/skip-envelope.decorator';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';

@ApiTags('Auth')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly auth: AuthService) {}

  @Get('jwks.json')
  @SkipEnvelope()
  @ApiOperation({
    operationId: 'auth.jwks.get',
    summary: 'JWKS',
    description: 'Publishes public keys used to verify access tokens.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'object' } },
      },
      required: ['keys'],
    },
  })
  async getJwks(): Promise<unknown> {
    return this.auth.getPublicJwks();
  }
}
