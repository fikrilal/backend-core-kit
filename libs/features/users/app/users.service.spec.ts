import { UsersService } from './users.service';
import { UserNotFoundError, type UsersError } from './users.errors';
import { UsersErrorCode } from './users.error-codes';
import type { AccountDeletionScheduler } from './ports/account-deletion.scheduler';
import type {
  CancelAccountDeletionResult,
  RequestAccountDeletionResult,
  UsersRepository,
} from './ports/users.repository';
import type { MeView, UpdateMeProfilePatch, UserRecord } from './users.types';

function unimplemented(): never {
  throw new Error('Not implemented');
}

function makeUser(partial?: Partial<UserRecord>): UserRecord {
  return {
    id: 'user-1',
    email: 'user@example.com',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    role: 'USER',
    status: 'ACTIVE',
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    authMethods: ['PASSWORD'],
    profile: null,
    ...partial,
  };
}

function makeRepo(overrides: Partial<UsersRepository>): UsersRepository {
  return {
    findById: async () => unimplemented(),
    updateProfile: async () => unimplemented(),
    requestAccountDeletion: async () => unimplemented(),
    cancelAccountDeletion: async () => unimplemented(),
    ...overrides,
  };
}

function makeScheduler(): {
  scheduler: AccountDeletionScheduler;
  scheduleCalls: Array<{ userId: string; scheduledFor: Date }>;
  cancelCalls: Array<{ userId: string }>;
} {
  const scheduleCalls: Array<{ userId: string; scheduledFor: Date }> = [];
  const cancelCalls: Array<{ userId: string }> = [];

  return {
    scheduleCalls,
    cancelCalls,
    scheduler: {
      scheduleFinalize: async (userId, scheduledFor) => {
        scheduleCalls.push({ userId, scheduledFor });
      },
      cancelFinalize: async (userId) => {
        cancelCalls.push({ userId });
      },
    },
  };
}

describe('UsersService', () => {
  it('getMe returns a MeView with a non-null profile', async () => {
    const repo = makeRepo({ findById: async () => makeUser({ profile: null }) });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    const res = await service.getMe('user-1');

    expect(res).toEqual<MeView>({
      id: 'user-1',
      email: 'user@example.com',
      emailVerified: true,
      roles: ['USER'],
      authMethods: ['PASSWORD'],
      profile: {
        profileImageFileId: null,
        displayName: null,
        givenName: null,
        familyName: null,
      },
      accountDeletion: null,
    });
  });

  it('getMe throws UserNotFoundError when repo returns null', async () => {
    const repo = makeRepo({ findById: async () => null });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    await expect(service.getMe('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('updateMeProfile throws UserNotFoundError when repo returns null', async () => {
    const repo = makeRepo({
      updateProfile: async () => null,
    });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    const patch: UpdateMeProfilePatch = { displayName: 'Alice' };
    await expect(service.updateMeProfile('missing', patch)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('requestAccountDeletion passes deterministic now + scheduledFor to the repository and schedules the job', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const expectedNow = new Date('2026-01-01T00:00:00.000Z');
    const expectedScheduledFor = new Date('2026-01-31T00:00:00.000Z');

    let capturedInput:
      | {
          userId: string;
          sessionId: string;
          traceId: string;
          now: Date;
          scheduledFor: Date;
        }
      | undefined;

    const repo = makeRepo({
      requestAccountDeletion: async (input) => {
        capturedInput = input;
        const user = makeUser({ deletionScheduledFor: null });
        const res: RequestAccountDeletionResult = { kind: 'ok', user };
        return res;
      },
    });

    const { scheduler, scheduleCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    const res = await service.requestAccountDeletion({
      userId: 'user-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput?.now.getTime()).toBe(expectedNow.getTime());
    expect(capturedInput?.scheduledFor.getTime()).toBe(expectedScheduledFor.getTime());

    expect(scheduleCalls).toHaveLength(1);
    expect(scheduleCalls[0]?.userId).toBe('user-1');
    expect(scheduleCalls[0]?.scheduledFor.getTime()).toBe(expectedScheduledFor.getTime());

    expect(res.scheduledFor.getTime()).toBe(expectedScheduledFor.getTime());
    expect(res.newlyRequested).toBe(true);

    jest.useRealTimers();
  });

  it('requestAccountDeletion uses the stored due date when already requested', async () => {
    const storedDue = new Date('2026-02-01T00:00:00.000Z');

    const repo = makeRepo({
      requestAccountDeletion: async () => {
        const user = makeUser({ deletionScheduledFor: storedDue });
        const res: RequestAccountDeletionResult = { kind: 'already_requested', user };
        return res;
      },
    });

    const { scheduler, scheduleCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    const res = await service.requestAccountDeletion({
      userId: 'user-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
    });

    expect(scheduleCalls).toHaveLength(1);
    expect(scheduleCalls[0]?.scheduledFor.getTime()).toBe(storedDue.getTime());
    expect(res.scheduledFor.getTime()).toBe(storedDue.getTime());
    expect(res.newlyRequested).toBe(false);
  });

  it('requestAccountDeletion throws UserNotFoundError when repo returns not_found', async () => {
    const repo = makeRepo({
      requestAccountDeletion: async () => ({ kind: 'not_found' }),
    });
    const { scheduler, scheduleCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    await expect(
      service.requestAccountDeletion({ userId: 'missing', sessionId: 's', traceId: 't' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(scheduleCalls).toHaveLength(0);
  });

  it('requestAccountDeletion throws a stable UsersError when attempting to delete the last admin', async () => {
    const repo = makeRepo({
      requestAccountDeletion: async () => ({ kind: 'last_admin' }),
    });
    const { scheduler, scheduleCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    await expect(
      service.requestAccountDeletion({ userId: 'user-1', sessionId: 's', traceId: 't' }),
    ).rejects.toMatchObject({
      status: 409,
      code: UsersErrorCode.USERS_CANNOT_DELETE_LAST_ADMIN,
    } satisfies Partial<UsersError>);

    expect(scheduleCalls).toHaveLength(0);
  });

  it('cancelAccountDeletion cancels the scheduled job (idempotent)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    let capturedNow: Date | undefined;

    const repo = makeRepo({
      cancelAccountDeletion: async (input) => {
        capturedNow = input.now;
        const user = makeUser();
        const res: CancelAccountDeletionResult = { kind: 'not_requested', user };
        return res;
      },
    });

    const { scheduler, cancelCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    await service.cancelAccountDeletion({ userId: 'user-1', sessionId: 's', traceId: 't' });

    expect(capturedNow?.getTime()).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
    expect(cancelCalls).toEqual([{ userId: 'user-1' }]);

    jest.useRealTimers();
  });

  it('cancelAccountDeletion throws UserNotFoundError when repo returns not_found', async () => {
    const repo = makeRepo({
      cancelAccountDeletion: async () => ({ kind: 'not_found' }),
    });

    const { scheduler, cancelCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler);

    await expect(
      service.cancelAccountDeletion({ userId: 'missing', sessionId: 's', traceId: 't' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(cancelCalls).toHaveLength(0);
  });
});
