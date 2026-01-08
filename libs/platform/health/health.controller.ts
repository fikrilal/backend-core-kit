import { Controller, Get } from '@nestjs/common';
import { SkipEnvelope } from '../http/decorators/skip-envelope.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @SkipEnvelope()
  getHealth() {
    return { status: 'ok' };
  }
}

