import type { PrismaService } from '../../../../platform/db/prisma.service';
import type { AuthUserRecord } from '../../app/auth.types';
import type {
  RefreshRotationResult,
  RefreshTokenRecord,
  RefreshTokenWithSession,
  SessionSeenMetadata,
} from '../../app/ports/auth.repository';
import { toAuthUserRecord, toRefreshTokenRecord } from './prisma-auth.repository.mappers';

class RefreshTokenAlreadyUsedError extends Error {
  constructor() {
    super('Refresh token already used');
  }
}

export async function createRefreshToken(
  prisma: PrismaService,
  sessionId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<RefreshTokenRecord> {
  const client = prisma.getClient();
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

export async function findRefreshTokenWithSession(
  prisma: PrismaService,
  tokenHash: string,
): Promise<RefreshTokenWithSession | null> {
  const client = prisma.getClient();
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
          user: {
            select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true },
          },
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

export async function rotateRefreshToken(
  prisma: PrismaService,
  tokenHash: string,
  newTokenHash: string,
  now: Date,
  session?: SessionSeenMetadata,
): Promise<RefreshRotationResult> {
  const client = prisma.getClient();
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
          user: {
            select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true },
          },
        },
      },
    },
  });

  if (!existing) return { kind: 'not_found' };

  const user: AuthUserRecord = toAuthUserRecord(existing.session.user);
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
    await revokeSessionAndTokens(prisma, sessionId, now);
    return { kind: 'revoked_or_reused', sessionId, userId };
  }

  try {
    await prisma.transaction(async (tx) => {
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

      await tx.session.update({
        where: { id: sessionId },
        data: {
          lastSeenAt: now,
          ...(session && session.ip !== undefined ? { ip: session.ip } : {}),
          ...(session && session.userAgent !== undefined ? { userAgent: session.userAgent } : {}),
        },
        select: { id: true },
      });
    });
  } catch (err: unknown) {
    if (err instanceof RefreshTokenAlreadyUsedError) {
      // If we lost a race, treat as reuse and revoke the session to contain potential replay.
      await revokeSessionAndTokens(prisma, sessionId, now);
      return { kind: 'revoked_or_reused', sessionId, userId };
    }
    throw err;
  }

  return { kind: 'ok', sessionId, user, sessionExpiresAt: existing.session.expiresAt };
}

export async function revokeSessionByRefreshTokenHash(
  prisma: PrismaService,
  tokenHash: string,
  now: Date,
): Promise<boolean> {
  const client = prisma.getClient();
  const existing = await client.refreshToken.findUnique({
    where: { tokenHash },
    select: { sessionId: true },
  });

  if (!existing) return false;

  await revokeSessionAndTokens(prisma, existing.sessionId, now);
  return true;
}

async function revokeSessionAndTokens(
  prisma: PrismaService,
  sessionId: string,
  now: Date,
): Promise<void> {
  await prisma.transaction(async (tx) => {
    await tx.session.updateMany({
      where: { id: sessionId },
      data: {
        activeKey: null,
        pushPlatform: null,
        pushToken: null,
        pushTokenUpdatedAt: now,
        pushTokenRevokedAt: now,
      },
    });

    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });

    await tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}
