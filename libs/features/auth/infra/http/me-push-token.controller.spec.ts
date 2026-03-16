import { HttpStatus } from '@nestjs/common';
import { AuthErrorCode } from '../../app/auth.error-codes';
import { AuthPushTokensService } from '../../app/auth-push-tokens.service';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { isObject } from '../../../../../test/auth/auth-e2e.harness';
import type { PushService } from '../../../../platform/push/push.service';
import { MePushTokenController } from './me-push-token.controller';
import { createPrototypeStub } from '../../../../../test/support/stubs';

describe('MePushTokenController', () => {
  it('upsertMyPushToken throws typed not-configured code when push is disabled', async () => {
    const pushTokens = createPrototypeStub(AuthPushTokensService, {
      upsertMyPushToken: async () => undefined,
      revokeMyPushToken: async () => undefined,
    });
    const push: PushService = { isEnabled: () => false, sendToToken: jest.fn() };
    const controller = new MePushTokenController(pushTokens, push);

    const err = await controller
      .upsertMyPushToken(
        {
          userId: 'user-1',
          sessionId: 'session-1',
          emailVerified: true,
          roles: ['USER'],
        },
        { platform: 'IOS', token: 'token-1' },
      )
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(err).toBeInstanceOf(ProblemException);
    if (!(err instanceof ProblemException)) {
      throw new Error('Expected ProblemException');
    }
    expect(err.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    const response = err.getResponse();
    if (!isObject(response)) {
      throw new Error('Expected problem response object');
    }
    expect(response.code).toBe(AuthErrorCode.AUTH_PUSH_NOT_CONFIGURED);
  });

  it('upsertMyPushToken forwards to service when push is enabled', async () => {
    const calls: Array<{ userId: string; sessionId: string; platform: string; token: string }> = [];

    const pushTokens = createPrototypeStub(AuthPushTokensService, {
      upsertMyPushToken: async (input: {
        userId: string;
        sessionId: string;
        platform: string;
        token: string;
      }) => {
        calls.push(input);
      },
      revokeMyPushToken: async () => undefined,
    });
    const push: PushService = { isEnabled: () => true, sendToToken: jest.fn() };
    const controller = new MePushTokenController(pushTokens, push);

    await controller.upsertMyPushToken(
      {
        userId: 'user-1',
        sessionId: 'session-1',
        emailVerified: true,
        roles: ['USER'],
      },
      { platform: 'ANDROID', token: 'token-2' },
    );

    expect(calls).toEqual([
      {
        userId: 'user-1',
        sessionId: 'session-1',
        platform: 'ANDROID',
        token: 'token-2',
      },
    ]);
  });
});
