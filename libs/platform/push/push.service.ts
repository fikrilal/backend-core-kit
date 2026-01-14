import type { SendPushToTokenInput, SendPushToTokenResult } from './push.types';

export interface PushService {
  isEnabled(): boolean;
  sendToToken(input: SendPushToTokenInput): Promise<SendPushToTokenResult>;
}
