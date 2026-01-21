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

export enum PushErrorCode {
  NotConfigured = 'push/not-configured',
  InvalidToken = 'push/invalid-token',
  SendFailed = 'push/send-failed',
}

export class PushSendError extends Error {
  readonly provider: string;
  readonly code: PushErrorCode;
  readonly providerCode?: string;
  readonly retryable: boolean;

  constructor(params: {
    provider: string;
    message: string;
    retryable: boolean;
    code: PushErrorCode;
    providerCode?: string;
  }) {
    super(params.message);
    this.provider = params.provider;
    this.code = params.code;
    this.providerCode = params.providerCode;
    this.retryable = params.retryable;
  }
}
