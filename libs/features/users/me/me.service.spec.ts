import { MeService } from './me.service';
import { UserNotFoundError } from '../shared/users.errors';
import type { UsersRepository } from '../shared/ports/users.repository';
import type { MeView, UpdateMeProfilePatch, UserRecord } from '../shared/users.model';

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

describe('MeService', () => {
  it('getMe returns a MeView with a non-null profile', async () => {
    const repo = makeRepo({ findById: async () => makeUser({ profile: null }) });
    const service = new MeService(repo);

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
    const service = new MeService(repo);

    await expect(service.getMe('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('getMe throws UserNotFoundError when user is DELETED', async () => {
    const repo = makeRepo({ findById: async () => makeUser({ status: 'DELETED' }) });
    const service = new MeService(repo);

    await expect(service.getMe('user-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('updateMeProfile throws UserNotFoundError when repo returns null', async () => {
    const repo = makeRepo({
      updateProfile: async () => null,
    });
    const service = new MeService(repo);

    const patch: UpdateMeProfilePatch = { displayName: 'Alice' };
    await expect(service.updateMeProfile('missing', patch)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});
