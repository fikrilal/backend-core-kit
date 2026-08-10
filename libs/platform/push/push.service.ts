import type { SendPushToTokenInput, SendPushToTokenResult } from './push.types';

export const PUSH_SERVICE = Symbol('PUSH_SERVICE');

export interface PushService {
  isEnabled(): boolean;
  sendToToken(input: SendPushToTokenInput): Promise<SendPushToTokenResult>;
}
