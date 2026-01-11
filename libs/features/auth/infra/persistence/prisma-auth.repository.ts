import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken, type User } from '@prisma/client';
import type { Email } from '../../domain/email';
import type { AuthRole, AuthUserRecord } from '../../app/auth.types';
import type {
  AuthRepository,
  ChangePasswordResult,
  CreateSessionInput,
  RefreshRotationResult,
  RefreshTokenRecord,
  RefreshTokenWithSession,
  SessionRecord,
} from '../../app/ports/auth.repository';
import { EmailAlreadyExistsError } from '../../app/auth.errors';
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

  async findPasswordCredential(userId: string): Promise<Readonly<{ passwordHash: string }> | null> {
    const client = this.prisma.getClient();
    const found = await client.passwordCredential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
    if (!found) return null;
    return { passwordHash: found.passwordHash };
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
