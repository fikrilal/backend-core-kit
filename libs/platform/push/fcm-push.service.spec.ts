import type { ConfigService } from '@nestjs/config';
import { FcmPushService } from './fcm-push.service';
import { PushErrorCode, PushSendError } from './push.types';

const initializeAppMock = jest.fn().mockReturnValue({ name: 'push' });
const certMock = jest.fn().mockReturnValue({ kind: 'cert' });
const applicationDefaultMock = jest.fn().mockReturnValue({ kind: 'adc' });
const getAppsMock = jest.fn().mockReturnValue([]);

const sendMock = jest.fn().mockResolvedValue('message-id');
const getMessagingMock = jest.fn().mockReturnValue({ send: sendMock });

jest.mock('firebase-admin/app', () => {
  return {
    initializeApp: (...args: unknown[]) => initializeAppMock(...args),
    cert: (...args: unknown[]) => certMock(...args),
    applicationDefault: (...args: unknown[]) => applicationDefaultMock(...args),
    getApps: (...args: unknown[]) => getAppsMock(...args),
  };
});

jest.mock('firebase-admin/messaging', () => {
  return {
    getMessaging: (...args: unknown[]) => getMessagingMock(...args),
  };
});

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

describe('FcmPushService', () => {
  beforeEach(() => {
    initializeAppMock.mockClear();
    certMock.mockClear();
    applicationDefaultMock.mockClear();
    getAppsMock.mockClear();
    sendMock.mockClear();
    getMessagingMock.mockClear();
  });

  it('is disabled when PUSH_PROVIDER is missing', () => {
    const svc = new FcmPushService(stubConfig({}));
    expect(svc.isEnabled()).toBe(false);
  });

  it('sends via firebase-admin messaging when configured', async () => {
    const svc = new FcmPushService(
      stubConfig({
        PUSH_PROVIDER: 'FCM',
        FCM_PROJECT_ID: 'project',
        FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
          project_id: 'project',
          client_email: 'svc@example.com',
          private_key: 'key',
        }),
      }),
    );

    expect(svc.isEnabled()).toBe(true);

    const res = await svc.sendToToken({
      token: 'token',
      notification: { title: 'Hi', body: 'Body' },
      data: { action: 'PING' },
    });

    expect(res).toEqual({ messageId: 'message-id' });
    expect(initializeAppMock).toHaveBeenCalled();
    expect(getMessagingMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token',
        notification: { title: 'Hi', body: 'Body' },
        data: { action: 'PING' },
      }),
    );
  });

  it('throws a non-retryable PushSendError for invalid token', async () => {
    sendMock.mockRejectedValueOnce({
      code: 'messaging/registration-token-not-registered',
      message: 'unregistered',
    });

    const svc = new FcmPushService(
      stubConfig({
        PUSH_PROVIDER: 'FCM',
        FCM_PROJECT_ID: 'project',
        FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
          project_id: 'project',
          client_email: 'svc@example.com',
          private_key: 'key',
        }),
      }),
    );

    try {
      await svc.sendToToken({ token: 'token' });
      throw new Error('Expected sendToToken to throw');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PushSendError);
      expect(err).toMatchObject({
        retryable: false,
        code: PushErrorCode.InvalidToken,
        providerCode: 'messaging/registration-token-not-registered',
      });
    }
  });
});
