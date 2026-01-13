export type PushNotification = Readonly<{
  title?: string;
  body?: string;
}>;

export type PushMessageData = Readonly<Record<string, string>>;

export type SendPushToTokenInput = Readonly<{
  token: string;
  notification?: PushNotification;
  data?: PushMessageData;
}>;

export type SendPushToTokenResult = Readonly<{ messageId: string }>;

export class PushSendError extends Error {
  readonly provider: string;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(params: { provider: string; message: string; retryable: boolean; code?: string }) {
    super(params.message);
    this.provider = params.provider;
    this.code = params.code;
    this.retryable = params.retryable;
  }
}
