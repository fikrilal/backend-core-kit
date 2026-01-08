import { Controller, Get } from '@nestjs/common';
import { SkipEnvelope } from '../http/decorators/skip-envelope.decorator';

@Controller('ready')
export class ReadyController {
  @Get()
  @SkipEnvelope()
  getReady() {
    // Until DB/Redis are introduced (milestone 4), readiness == process is up.
    return { status: 'ok' };
  }
}

