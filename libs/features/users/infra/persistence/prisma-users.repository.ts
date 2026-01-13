import { Injectable } from '@nestjs/common';
import {
  ExternalIdentityProvider as PrismaExternalIdentityProvider,
  Prisma,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
  type ExternalIdentity,
  type PasswordCredential,
  type User,
  type UserProfile,
} from '@prisma/client';
import type { UsersRepository } from '../../app/ports/users.repository';
import type {
  UpdateMeProfilePatch,
  UserProfileRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from '../../app/users.types';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { AuthMethod } from '../../../../shared/auth/auth-method';

type PrismaUserWithProfile = Pick<
  User,
  | 'id'
  | 'email'
  | 'emailVerifiedAt'
  | 'role'
  | 'status'
  | 'deletionRequestedAt'
  | 'deletionScheduledFor'
> & {
  profile: Pick<
    UserProfile,
    'profileImageFileId' | 'displayName' | 'givenName' | 'familyName'
  > | null;
  passwordCredential: Pick<PasswordCredential, 'userId'> | null;
  externalIdentities: Array<Pick<ExternalIdentity, 'provider'>>;
};

function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

function toProfileRecord(profile: PrismaUserWithProfile['profile']): UserProfileRecord | null {
  if (!profile) return null;
  return {
    profileImageFileId: profile.profileImageFileId,
    displayName: profile.displayName,
    givenName: profile.givenName,
    familyName: profile.familyName,
  };
}

function toAuthMethods(user: PrismaUserWithProfile): AuthMethod[] {
  const methods: AuthMethod[] = [];

  if (user.passwordCredential) methods.push('PASSWORD');

  const hasGoogle = user.externalIdentities.some(
    (i) => i.provider === PrismaExternalIdentityProvider.GOOGLE,
  );
  if (hasGoogle) methods.push('GOOGLE');

  return methods;
}

function toUserRecord(user: PrismaUserWithProfile): UserRecord {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role as UserRole,
    status: user.status as UserStatus,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionScheduledFor: user.deletionScheduledFor,
    authMethods: toAuthMethods(user),
    profile: toProfileRecord(user.profile),
  };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        status: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        profile: {
          select: {
            profileImageFileId: true,
            displayName: true,
            givenName: true,
            familyName: true,
          },
        },
        passwordCredential: { select: { userId: true } },
        externalIdentities: { select: { provider: true } },
      },
    });
    if (!user) return null;
    if (user.status === PrismaUserStatus.DELETED) return null;
    return toUserRecord(user);
  }

  async updateProfile(userId: string, patch: UpdateMeProfilePatch): Promise<UserRecord | null> {
    const client = this.prisma.getClient();

    const existing = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!existing || existing.status === PrismaUserStatus.DELETED) return null;

    const profileData: {
      displayName?: string | null;
      givenName?: string | null;
      familyName?: string | null;
    } = {};

    if (patch.displayName !== undefined) profileData.displayName = patch.displayName;
    if (patch.givenName !== undefined) profileData.givenName = patch.givenName;
    if (patch.familyName !== undefined) profileData.familyName = patch.familyName;

    try {
      const user = await client.user.update({
        where: { id: userId },
        data: {
          profile: {
            upsert: {
              create: profileData,
              update: profileData,
            },
          },
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          role: true,
          status: true,
          deletionRequestedAt: true,
          deletionScheduledFor: true,
          profile: {
            select: {
              profileImageFileId: true,
              displayName: true,
              givenName: true,
              familyName: true,
            },
          },
          passwordCredential: { select: { userId: true } },
          externalIdentities: { select: { provider: true } },
        },
      });

      return toUserRecord(user);
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) return null;
      throw err;
    }
  }

  async requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
    scheduledFor: Date;
  }) {
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: input.userId },
              select: {
                id: true,
                email: true,
                emailVerifiedAt: true,
                role: true,
                status: true,
                deletionRequestedAt: true,
                deletionScheduledFor: true,
                profile: {
                  select: {
                    profileImageFileId: true,
                    displayName: true,
                    givenName: true,
                    familyName: true,
                  },
                },
                passwordCredential: { select: { userId: true } },
                externalIdentities: { select: { provider: true } },
              },
            });
            if (!user) return { kind: 'not_found' } as const;
            if (user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' } as const;

            if (
              user.role === PrismaUserRole.ADMIN &&
              user.status === PrismaUserStatus.ACTIVE &&
              user.deletionScheduledFor === null
            ) {
              const activeAdminCount = await tx.user.count({
                where: { role: PrismaUserRole.ADMIN, status: PrismaUserStatus.ACTIVE },
              });
              if (activeAdminCount <= 1) return { kind: 'last_admin' } as const;
            }

            if (user.deletionScheduledFor !== null) {
              return { kind: 'already_requested', user: toUserRecord(user) } as const;
            }

            const updated = await tx.user.update({
              where: { id: input.userId },
              data: {
                deletionRequestedAt: input.now,
                deletionScheduledFor: input.scheduledFor,
                deletionRequestedSessionId: input.sessionId,
                deletionRequestedTraceId: input.traceId,
              },
              select: {
                id: true,
                email: true,
                emailVerifiedAt: true,
                role: true,
                status: true,
                deletionRequestedAt: true,
                deletionScheduledFor: true,
                profile: {
                  select: {
                    profileImageFileId: true,
                    displayName: true,
                    givenName: true,
                    familyName: true,
                  },
                },
                passwordCredential: { select: { userId: true } },
                externalIdentities: { select: { provider: true } },
              },
            });

            await tx.userAccountDeletionAudit.create({
              data: {
                actorUserId: input.userId,
                actorSessionId: input.sessionId,
                targetUserId: input.userId,
                action: 'REQUESTED',
                traceId: input.traceId,
              },
              select: { id: true },
            });

            return { kind: 'ok', user: toUserRecord(updated) } as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err: unknown) {
        if (attempt < maxAttempts && isRetryableTransactionError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Unexpected: exhausted transaction retries');
  }

  async cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
  }) {
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: input.userId },
              select: {
                id: true,
                email: true,
                emailVerifiedAt: true,
                role: true,
                status: true,
                deletionRequestedAt: true,
                deletionScheduledFor: true,
                profile: {
                  select: {
                    profileImageFileId: true,
                    displayName: true,
                    givenName: true,
                    familyName: true,
                  },
                },
                passwordCredential: { select: { userId: true } },
                externalIdentities: { select: { provider: true } },
              },
            });
            if (!user) return { kind: 'not_found' } as const;
            if (user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' } as const;

            if (user.deletionScheduledFor === null) {
              return { kind: 'not_requested', user: toUserRecord(user) } as const;
            }

            const updated = await tx.user.update({
              where: { id: input.userId },
              data: {
                deletionRequestedAt: null,
                deletionScheduledFor: null,
                deletionRequestedSessionId: null,
                deletionRequestedTraceId: null,
              },
              select: {
                id: true,
                email: true,
                emailVerifiedAt: true,
                role: true,
                status: true,
                deletionRequestedAt: true,
                deletionScheduledFor: true,
                profile: {
                  select: {
                    profileImageFileId: true,
                    displayName: true,
                    givenName: true,
                    familyName: true,
                  },
                },
                passwordCredential: { select: { userId: true } },
                externalIdentities: { select: { provider: true } },
              },
            });

            await tx.userAccountDeletionAudit.create({
              data: {
                actorUserId: input.userId,
                actorSessionId: input.sessionId,
                targetUserId: input.userId,
                action: 'CANCELED',
                traceId: input.traceId,
              },
              select: { id: true },
            });

            return { kind: 'ok', user: toUserRecord(updated) } as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err: unknown) {
        if (attempt < maxAttempts && isRetryableTransactionError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Unexpected: exhausted transaction retries');
  }
}

function isRetryableTransactionError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return err.code === 'P2034';
}
