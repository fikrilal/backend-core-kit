import { Injectable } from '@nestjs/common';
import type { PushService } from './push.service';
import type { SendPushToTokenInput, SendPushToTokenResult } from './push.types';
import { PushSendError } from './push.types';

@Injectable()
export class DisabledPushService implements PushService {
  isEnabled(): boolean {
    return false;
  }

  async sendToToken(_input: SendPushToTokenInput): Promise<SendPushToTokenResult> {
    throw new PushSendError({
      provider: 'disabled',
      message: 'Push provider is not configured (set PUSH_PROVIDER=FCM and FCM_* credentials)',
      retryable: false,
      code: 'push/not-configured',
    });
  }
}
