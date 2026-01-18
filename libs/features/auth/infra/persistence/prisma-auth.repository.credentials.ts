import type { PrismaService } from '../../../../platform/db/prisma.service';
import type {
  ChangePasswordResult,
  ResetPasswordByTokenHashResult,
} from '../../app/ports/auth.repository';
import { withSerializableRetry } from './prisma-auth.repository.tx';

export async function findPasswordCredential(
  prisma: PrismaService,
  userId: string,
): Promise<Readonly<{ passwordHash: string }> | null> {
  const client = prisma.getClient();
  const found = await client.passwordCredential.findUnique({
    where: { userId },
    select: { passwordHash: true },
  });
  if (!found) return null;
  return { passwordHash: found.passwordHash };
}

export async function resetPasswordByTokenHash(
  prisma: PrismaService,
  tokenHash: string,
  newPasswordHash: string,
  now: Date,
): Promise<ResetPasswordByTokenHashResult> {
  const client = prisma.getClient();

  return await withSerializableRetry(client, async (tx) => {
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
      data: {
        revokedAt: now,
        activeKey: null,
        pushPlatform: null,
        pushToken: null,
        pushTokenUpdatedAt: now,
        pushTokenRevokedAt: now,
      },
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
  });
}

export async function changePasswordAndRevokeOtherSessions(
  prisma: PrismaService,
  input: {
    userId: string;
    sessionId: string;
    expectedCurrentPasswordHash: string;
    newPasswordHash: string;
    now: Date;
  },
): Promise<ChangePasswordResult> {
  const client = prisma.getClient();

  return await withSerializableRetry(client, async (tx) => {
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
      data: {
        revokedAt: input.now,
        activeKey: null,
        pushPlatform: null,
        pushToken: null,
        pushTokenUpdatedAt: input.now,
        pushTokenRevokedAt: input.now,
      },
    });

    await tx.refreshToken.updateMany({
      where: { sessionId: { in: otherSessionIds }, revokedAt: null },
      data: { revokedAt: input.now },
    });

    return { kind: 'ok' };
  });
}
