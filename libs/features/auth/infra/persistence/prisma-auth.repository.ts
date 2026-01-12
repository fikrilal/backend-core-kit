import { Injectable } from '@nestjs/common';
import {
  ExternalIdentityProvider as PrismaExternalIdentityProvider,
  Prisma,
  type RefreshToken,
  type User,
} from '@prisma/client';
import { encodeCursorV1, type ListQuery, type SortSpec } from '../../../../shared/list-query';
import type { AuthMethod } from '../../../../shared/auth/auth-method';
import type { Email } from '../../domain/email';
import type { AuthRole, AuthUserRecord } from '../../app/auth.types';
import type { OidcProvider } from '../../app/ports/oidc-id-token-verifier';
import type {
  AuthRepository,
  ChangePasswordResult,
  CreateSessionInput,
  LinkExternalIdentityResult,
  ListUserSessionsResult,
  RefreshRotationResult,
  RefreshTokenRecord,
  RefreshTokenWithSession,
  UserSessionListItem,
  UserSessionsSortField,
  ResetPasswordByTokenHashResult,
  SessionRecord,
  VerifyEmailResult,
} from '../../app/ports/auth.repository';
import { EmailAlreadyExistsError, ExternalIdentityAlreadyExistsError } from '../../app/auth.errors';
import { PrismaService } from '../../../../platform/db/prisma.service';

function isUniqueConstraintError(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  if (!field) return true;

  const meta: unknown = err.meta;
  if (!meta || typeof meta !== 'object') return true;

  const target: unknown = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) {
    return target.some((t) => typeof t === 'string' && t === field);
  }
  if (typeof target === 'string') {
    return target.includes(field);
  }
  return true;
}

function isUniqueConstraintErrorOnFields(err: unknown, fields: ReadonlyArray<string>): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;

  const meta: unknown = err.meta;
  if (!meta || typeof meta !== 'object') return false;

  const target: unknown = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) {
    const t = target.filter((v): v is string => typeof v === 'string');
    return fields.every((f) => t.includes(f));
  }
  if (typeof target === 'string') {
    return fields.every((f) => target.includes(f));
  }
  return false;
}

function toAuthUserRecord(
  user: Pick<User, 'id' | 'email' | 'emailVerifiedAt' | 'role'>,
): AuthUserRecord {
  return {
    id: user.id,
    email: user.email as Email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role as AuthRole,
  };
}

function toPrismaExternalIdentityProvider(provider: OidcProvider): PrismaExternalIdentityProvider {
  switch (provider) {
    case 'GOOGLE':
      return PrismaExternalIdentityProvider.GOOGLE;
  }
}

async function verifyEmailIfMatching(input: {
  tx: Prisma.TransactionClient;
  user: Readonly<{ id: string; email: string; emailVerifiedAt: Date | null }>;
  email?: string;
  now: Date;
}): Promise<void> {
  if (!input.email) return;
  if (input.user.emailVerifiedAt !== null) return;
  if (input.email !== input.user.email) return;

  await input.tx.user.updateMany({
    where: { id: input.user.id, emailVerifiedAt: null },
    data: { emailVerifiedAt: input.now },
  });
}

function toRefreshTokenRecord(
  token: Pick<
    RefreshToken,
    'id' | 'tokenHash' | 'expiresAt' | 'revokedAt' | 'sessionId' | 'replacedById'
  >,
): RefreshTokenRecord {
  return {
    id: token.id,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    sessionId: token.sessionId,
    replacedById: token.replacedById,
  };
}

class RefreshTokenAlreadyUsedError extends Error {
  constructor() {
    super('Refresh token already used');
  }
}

function sortSessionFieldOrderBy(
  field: UserSessionsSortField,
  direction: 'asc' | 'desc',
): Prisma.SessionOrderByWithRelationInput {
  switch (field) {
    case 'createdAt':
      return { createdAt: direction };
    case 'id':
      return { id: direction };
  }
}

function equalsSessionForCursor(
  field: UserSessionsSortField,
  value: string | number | boolean,
): Prisma.SessionWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      return { createdAt: { equals: new Date(value) } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return { id: { equals: value } };
    }
  }
}

function compareSessionForCursor(
  field: UserSessionsSortField,
  direction: 'asc' | 'desc',
  value: string | number | boolean,
): Prisma.SessionWhereInput {
  switch (field) {
    case 'createdAt': {
      if (typeof value !== 'string') {
        throw new Error('Cursor value for createdAt must be an ISO datetime string');
      }
      const date = new Date(value);
      return direction === 'asc' ? { createdAt: { gt: date } } : { createdAt: { lt: date } };
    }
    case 'id': {
      if (typeof value !== 'string') throw new Error('Cursor value for id must be a string');
      return direction === 'asc' ? { id: { gt: value } } : { id: { lt: value } };
    }
  }
}

function buildAfterSessionCursorWhere(
  sort: ReadonlyArray<SortSpec<UserSessionsSortField>>,
  after: Readonly<Partial<Record<UserSessionsSortField, string | number | boolean>>>,
): Prisma.SessionWhereInput {
  if (sort.length === 0) return {};

  const clauses: Prisma.SessionWhereInput[] = [];

  for (let i = 0; i < sort.length; i += 1) {
    const and: Prisma.SessionWhereInput[] = [];

    for (let j = 0; j < i; j += 1) {
      const field = sort[j].field;
      const value = after[field];
      if (value === undefined) {
        throw new Error(`Cursor missing value for sort field "${String(field)}"`);
      }
      and.push(equalsSessionForCursor(field, value));
    }

    const field = sort[i].field;
    const value = after[field];
    if (value === undefined) {
      throw new Error(`Cursor missing value for sort field "${String(field)}"`);
    }
    and.push(compareSessionForCursor(field, sort[i].direction, value));

    clauses.push({ AND: and });
  }

  return { OR: clauses };
}

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithPassword(email: Email, passwordHash: string): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.transaction(async (tx) =>
        tx.user.create({
          data: {
            email,
            passwordCredential: { create: { passwordHash } },
            profile: { create: {} },
          },
          select: { id: true, email: true, emailVerifiedAt: true, role: true },
        }),
      );
      return toAuthUserRecord(user);
    } catch (err: unknown) {
      if (isUniqueConstraintError(err, 'email')) {
        throw new EmailAlreadyExistsError();
      }
      throw err;
    }
  }

  async findUserIdByEmail(email: Email): Promise<string | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, role: true },
    });
    return user ? toAuthUserRecord(user) : null;
  }

  async getAuthMethods(userId: string): Promise<ReadonlyArray<AuthMethod>> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        passwordCredential: { select: { userId: true } },
        externalIdentities: { select: { provider: true } },
      },
    });
    if (!user) throw new Error('User not found');

    const methods: AuthMethod[] = [];

    if (user.passwordCredential) methods.push('PASSWORD');

    const hasGoogle = user.externalIdentities.some(
      (i) => i.provider === PrismaExternalIdentityProvider.GOOGLE,
    );
    if (hasGoogle) methods.push('GOOGLE');

    return methods;
  }

  async findUserByExternalIdentity(
    provider: OidcProvider,
    subject: string,
  ): Promise<AuthUserRecord | null> {
    const client = this.prisma.getClient();
    const found = await client.externalIdentity.findFirst({
      where: { provider: toPrismaExternalIdentityProvider(provider), subject },
      select: { user: { select: { id: true, email: true, emailVerifiedAt: true, role: true } } },
    });
    return found ? toAuthUserRecord(found.user) : null;
  }

  async createUserWithExternalIdentity(input: {
    email: Email;
    emailVerifiedAt: Date;
    profile?: Readonly<{ displayName?: string; givenName?: string; familyName?: string }>;
    externalIdentity: Readonly<{ provider: OidcProvider; subject: string; email?: string }>;
  }): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.transaction(async (tx) =>
        tx.user.create({
          data: {
            email: input.email,
            emailVerifiedAt: input.emailVerifiedAt,
            profile: {
              create: {
                ...(input.profile?.displayName ? { displayName: input.profile.displayName } : {}),
                ...(input.profile?.givenName ? { givenName: input.profile.givenName } : {}),
                ...(input.profile?.familyName ? { familyName: input.profile.familyName } : {}),
              },
            },
            externalIdentities: {
              create: {
                provider: toPrismaExternalIdentityProvider(input.externalIdentity.provider),
                subject: input.externalIdentity.subject,
                ...(input.externalIdentity.email ? { email: input.externalIdentity.email } : {}),
              },
            },
          },
          select: { id: true, email: true, emailVerifiedAt: true, role: true },
        }),
      );
      return toAuthUserRecord(user);
    } catch (err: unknown) {
      if (isUniqueConstraintError(err, 'email')) {
        throw new EmailAlreadyExistsError();
      }
      if (isUniqueConstraintErrorOnFields(err, ['provider', 'subject'])) {
        throw new ExternalIdentityAlreadyExistsError();
      }
      throw err;
    }
  }

  async linkExternalIdentityToUser(input: {
    userId: string;
    provider: OidcProvider;
    subject: string;
    email?: Email;
    now: Date;
  }): Promise<LinkExternalIdentityResult> {
    const provider = toPrismaExternalIdentityProvider(input.provider);

    return await this.prisma.transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (!user) return { kind: 'user_not_found' };

      const identity = await tx.externalIdentity.findFirst({
        where: { provider, subject: input.subject },
        select: { userId: true },
      });

      if (identity) {
        if (identity.userId !== input.userId) return { kind: 'identity_linked_to_other_user' };

        await verifyEmailIfMatching({
          tx,
          user,
          email: input.email,
          now: input.now,
        });

        return { kind: 'already_linked' };
      }

      const existingProvider = await tx.externalIdentity.findFirst({
        where: { userId: input.userId, provider },
        select: { id: true },
      });
      if (existingProvider) return { kind: 'provider_already_linked' };

      try {
        await tx.externalIdentity.create({
          data: {
            provider,
            subject: input.subject,
            ...(input.email ? { email: input.email } : {}),
            userId: input.userId,
          },
          select: { id: true },
        });
      } catch (err: unknown) {
        if (!isUniqueConstraintError(err)) throw err;

        const racedIdentity = await tx.externalIdentity.findFirst({
          where: { provider, subject: input.subject },
          select: { userId: true },
        });
        if (racedIdentity) {
          if (racedIdentity.userId !== input.userId) {
            return { kind: 'identity_linked_to_other_user' };
          }

          await verifyEmailIfMatching({
            tx,
            user,
            email: input.email,
            now: input.now,
          });

          return { kind: 'already_linked' };
        }

        const racedProvider = await tx.externalIdentity.findFirst({
          where: { userId: input.userId, provider },
          select: { id: true },
        });
        if (racedProvider) return { kind: 'provider_already_linked' };

        throw err;
      }

      await verifyEmailIfMatching({
        tx,
        user,
        email: input.email,
        now: input.now,
      });

      return { kind: 'ok' };
    });
  }

  async listUserSessions(
    userId: string,
    query: ListQuery<UserSessionsSortField, never>,
  ): Promise<ListUserSessionsResult> {
    const client = this.prisma.getClient();

    const afterWhere =
      query.cursor && query.cursor.after
        ? buildAfterSessionCursorWhere(query.sort, query.cursor.after)
        : {};

    const where =
      query.cursor && query.cursor.after ? { AND: [{ userId }, afterWhere] } : { userId };

    const orderBy = query.sort.map((s) => sortSessionFieldOrderBy(s.field, s.direction));

    const take = query.limit + 1;
    const sessions = await client.session.findMany({
      where,
      orderBy,
      take,
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const hasMore = sessions.length > query.limit;
    const page = hasMore ? sessions.slice(0, query.limit) : sessions;

    const items: UserSessionListItem[] = page.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
    }));

    const nextCursor = (() => {
      if (!hasMore) return undefined;
      const last = page.at(-1);
      if (!last) return undefined;

      const after: Partial<Record<UserSessionsSortField, string | number | boolean>> = {};
      for (const s of query.sort) {
        if (s.field === 'createdAt') after.createdAt = last.createdAt.toISOString();
        else if (s.field === 'id') after.id = last.id;
      }

      return encodeCursorV1({
        v: 1,
        sort: query.normalizedSort,
        after,
      });
    })();

    return {
      items,
      limit: query.limit,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async revokeSessionById(userId: string, sessionId: string, now: Date): Promise<boolean> {
    return await this.prisma.transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, revokedAt: true },
      });
      if (!session || session.userId !== userId) return false;

      if (session.revokedAt === null) {
        await tx.session.update({
          where: { id: sessionId },
          data: { revokedAt: now, activeKey: null },
          select: { id: true },
        });
      } else {
        await tx.session.updateMany({
          where: { id: sessionId, userId, activeKey: { not: null } },
          data: { activeKey: null },
        });
      }

      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });

      return true;
    });
  }

  async findUserForLogin(
    email: Email,
  ): Promise<{ user: AuthUserRecord; passwordHash: string } | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        passwordCredential: { select: { passwordHash: true } },
      },
    });

    if (!user || !user.passwordCredential) return null;
    return {
      user: toAuthUserRecord(user),
      passwordHash: user.passwordCredential.passwordHash,
    };
  }

  async verifyEmailByTokenHash(tokenHash: string, now: Date): Promise<VerifyEmailResult> {
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const token = await tx.emailVerificationToken.findUnique({
              where: { tokenHash },
              select: {
                id: true,
                userId: true,
                expiresAt: true,
                usedAt: true,
                revokedAt: true,
                user: { select: { emailVerifiedAt: true } },
              },
            });

            if (!token) return { kind: 'token_invalid' };

            // Idempotent success: if the user is already verified, treat as ok and mark the token as used.
            if (token.user.emailVerifiedAt !== null) {
              await tx.emailVerificationToken.updateMany({
                where: { id: token.id, usedAt: null },
                data: { usedAt: now },
              });
              return { kind: 'already_verified' };
            }

            if (token.revokedAt !== null || token.usedAt !== null) {
              return { kind: 'token_invalid' };
            }

            if (token.expiresAt.getTime() <= now.getTime()) {
              return { kind: 'token_expired' };
            }

            const userUpdated = await tx.user.updateMany({
              where: { id: token.userId, emailVerifiedAt: null },
              data: { emailVerifiedAt: now },
            });

            await tx.emailVerificationToken.updateMany({
              where: { id: token.id, usedAt: null },
              data: { usedAt: now },
            });

            if (userUpdated.count === 0) return { kind: 'already_verified' };
            return { kind: 'ok' };
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

  async findPasswordCredential(userId: string): Promise<Readonly<{ passwordHash: string }> | null> {
    const client = this.prisma.getClient();
    const found = await client.passwordCredential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
    if (!found) return null;
    return { passwordHash: found.passwordHash };
  }

  async resetPasswordByTokenHash(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<ResetPasswordByTokenHashResult> {
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const token = await tx.passwordResetToken.findUnique({
              where: { tokenHash },
              select: { id: true, userId: true, expiresAt: true, usedAt: true, revokedAt: true },
            });

            if (!token) return { kind: 'token_invalid' };
            if (token.revokedAt !== null || token.usedAt !== null) return { kind: 'token_invalid' };
            if (token.expiresAt.getTime() <= now.getTime()) return { kind: 'token_expired' };

            const markedUsed = await tx.passwordResetToken.updateMany({
              where: { id: token.id, usedAt: null, revokedAt: null },
              data: { usedAt: now },
            });
            if (markedUsed.count !== 1) return { kind: 'token_invalid' };

            await tx.passwordCredential.upsert({
              where: { userId: token.userId },
              create: { userId: token.userId, passwordHash: newPasswordHash },
              update: { passwordHash: newPasswordHash },
            });

            await tx.session.updateMany({
              where: { userId: token.userId, revokedAt: null },
              data: { revokedAt: now, activeKey: null },
            });

            await tx.refreshToken.updateMany({
              where: { revokedAt: null, session: { userId: token.userId } },
              data: { revokedAt: now },
            });

            await tx.passwordResetToken.updateMany({
              where: { userId: token.userId, usedAt: null, revokedAt: null },
              data: { revokedAt: now },
            });

            return { kind: 'ok', userId: token.userId };
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

  async changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    sessionId: string;
    expectedCurrentPasswordHash: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<ChangePasswordResult> {
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: input.userId },
              select: { id: true },
            });
            if (!user) return { kind: 'not_found' };

            const credential = await tx.passwordCredential.findUnique({
              where: { userId: input.userId },
              select: { passwordHash: true },
            });
            if (!credential) return { kind: 'password_not_set' };

            if (credential.passwordHash !== input.expectedCurrentPasswordHash) {
              return { kind: 'current_password_mismatch' };
            }

            await tx.passwordCredential.update({
              where: { userId: input.userId },
              data: { passwordHash: input.newPasswordHash },
            });

            const otherSessions = await tx.session.findMany({
              where: { userId: input.userId, id: { not: input.sessionId }, revokedAt: null },
              select: { id: true },
            });
            const otherSessionIds = otherSessions.map((s) => s.id);

            if (otherSessionIds.length === 0) return { kind: 'ok' };

            await tx.session.updateMany({
              where: { id: { in: otherSessionIds } },
              data: { revokedAt: input.now, activeKey: null },
            });

            await tx.refreshToken.updateMany({
              where: { sessionId: { in: otherSessionIds }, revokedAt: null },
              data: { revokedAt: input.now },
            });

            return { kind: 'ok' };
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

  async findRefreshTokenWithSession(tokenHash: string): Promise<RefreshTokenWithSession | null> {
    const client = this.prisma.getClient();
    const found = await client.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        sessionId: true,
        replacedById: true,
        session: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
            user: { select: { id: true, email: true, emailVerifiedAt: true, role: true } },
          },
        },
      },
    });

    if (!found) return null;

    return {
      token: toRefreshTokenRecord(found),
      session: {
        id: found.session.id,
        userId: found.session.userId,
        expiresAt: found.session.expiresAt,
        revokedAt: found.session.revokedAt,
      },
      user: toAuthUserRecord(found.session.user),
    };
  }

  async revokeActiveSessionForDevice(userId: string, activeKey: string, now: Date): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await tx.session.findUnique({
        where: { activeKey },
        select: { id: true, userId: true, revokedAt: true },
      });

      if (!existing || existing.userId !== userId || existing.revokedAt !== null) return;

      await tx.session.update({
        where: { id: existing.id },
        data: { revokedAt: now, activeKey: null },
      });

      await tx.refreshToken.updateMany({
        where: { sessionId: existing.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const client = this.prisma.getClient();
    const session = await client.session.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        activeKey: input.activeKey,
        expiresAt: input.sessionExpiresAt,
      },
      select: { id: true, expiresAt: true },
    });
    return { id: session.id, expiresAt: session.expiresAt };
  }

  async createRefreshToken(
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshTokenRecord> {
    const client = this.prisma.getClient();
    const token = await client.refreshToken.create({
      data: { sessionId, tokenHash, expiresAt },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        sessionId: true,
        replacedById: true,
      },
    });
    return toRefreshTokenRecord(token);
  }

  async rotateRefreshToken(
    tokenHash: string,
    newTokenHash: string,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const client = this.prisma.getClient();
    const existing = await client.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        sessionId: true,
        replacedById: true,
        session: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
            activeKey: true,
            user: { select: { id: true, email: true, emailVerifiedAt: true, role: true } },
          },
        },
      },
    });

    if (!existing) return { kind: 'not_found' };

    const user = toAuthUserRecord(existing.session.user);
    const sessionId = existing.session.id;
    const userId = existing.session.userId;

    if (existing.session.revokedAt !== null) {
      return { kind: 'session_revoked', sessionId, userId };
    }

    const expired =
      existing.expiresAt.getTime() <= now.getTime() ||
      existing.session.expiresAt.getTime() <= now.getTime();
    if (expired) {
      return { kind: 'expired', sessionId, userId };
    }

    const alreadyUsed = existing.revokedAt !== null || existing.replacedById !== null;
    if (alreadyUsed) {
      await this.revokeSessionAndTokens(sessionId, now);
      return { kind: 'revoked_or_reused', sessionId, userId };
    }

    try {
      await this.prisma.transaction(async (tx) => {
        const next = await tx.refreshToken.create({
          data: {
            tokenHash: newTokenHash,
            expiresAt: existing.expiresAt,
            sessionId,
          },
          select: { id: true },
        });

        const updated = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null, replacedById: null },
          data: { revokedAt: now, replacedById: next.id },
        });

        if (updated.count !== 1) {
          throw new RefreshTokenAlreadyUsedError();
        }
      });
    } catch (err: unknown) {
      if (err instanceof RefreshTokenAlreadyUsedError) {
        // If we lost a race, treat as reuse and revoke the session to contain potential replay.
        await this.revokeSessionAndTokens(sessionId, now);
        return { kind: 'revoked_or_reused', sessionId, userId };
      }
      throw err;
    }

    return { kind: 'ok', sessionId, user, sessionExpiresAt: existing.session.expiresAt };
  }

  async revokeSessionByRefreshTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const client = this.prisma.getClient();
    const existing = await client.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true },
    });

    if (!existing) return false;

    await this.revokeSessionAndTokens(existing.sessionId, now);
    return true;
  }

  private async revokeSessionAndTokens(sessionId: string, now: Date): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, activeKey: null },
      });

      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }
}

function isRetryableTransactionError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return err.code === 'P2034';
}
