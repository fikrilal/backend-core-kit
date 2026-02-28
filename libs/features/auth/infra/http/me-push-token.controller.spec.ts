import { HttpStatus } from '@nestjs/common';
import { AuthErrorCode } from '../../app/auth.error-codes';
import type { AuthPushTokensService } from '../../app/auth-push-tokens.service';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import type { PushService } from '../../../../platform/push/push.service';
import { MePushTokenController } from './me-push-token.controller';

function asAuthPushTokensService(service: Partial<AuthPushTokensService>): AuthPushTokensService {
  return service as AuthPushTokensService;
}

function asPushService(service: Partial<PushService>): PushService {
  return service as PushService;
}

describe('MePushTokenController', () => {
  it('upsertMyPushToken throws typed not-configured code when push is disabled', async () => {
    const pushTokens = asAuthPushTokensService({
      upsertMyPushToken: async () => undefined,
      revokeMyPushToken: async () => undefined,
    });
    const push = asPushService({ isEnabled: () => false });
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
    expect((err as ProblemException).getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    const response = (err as ProblemException).getResponse() as { code?: string };
    expect(response.code).toBe(AuthErrorCode.AUTH_PUSH_NOT_CONFIGURED);
  });

  it('upsertMyPushToken forwards to service when push is enabled', async () => {
    const calls: Array<{ userId: string; sessionId: string; platform: string; token: string }> = [];

    const pushTokens = asAuthPushTokensService({
      upsertMyPushToken: async (input) => {
        calls.push(input);
      },
      revokeMyPushToken: async () => undefined,
    });
    const push = asPushService({ isEnabled: () => true });
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
