import type { Prisma } from '@prisma/client';
import {
  buildCursorAfterWhere,
  encodeCursorV1,
  type ListQuery,
} from '../../../../shared/list-query';
import type { PrismaService } from '../../../../platform/db/prisma.service';
import type {
  CreateSessionInput,
  ListUserSessionsResult,
  SessionPushPlatform,
  SessionRecord,
  UpsertSessionPushTokenResult,
  UserSessionListItem,
  UserSessionsSortField,
} from '../../app/ports/auth.repository';
import { isUniqueConstraintError } from './prisma-auth.repository.prisma-errors';
import { toPrismaPushPlatform } from './prisma-auth.repository.mappers';
import { isRetryableTransactionError, withSerializableRetry } from './prisma-auth.repository.tx';

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

export async function listUserSessions(
  prisma: PrismaService,
  userId: string,
  query: ListQuery<UserSessionsSortField, never>,
): Promise<ListUserSessionsResult> {
  const client = prisma.getClient();

  const afterWhere =
    query.cursor && query.cursor.after
      ? buildCursorAfterWhere({
          sort: query.sort,
          after: query.cursor.after,
          builders: {
            equals: equalsSessionForCursor,
            compare: compareSessionForCursor,
            and: (clauses) => ({ AND: clauses }),
            or: (clauses) => ({ OR: clauses }),
            empty: () => ({}),
          },
        })
      : {};

  const where = query.cursor && query.cursor.after ? { AND: [{ userId }, afterWhere] } : { userId };

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
      ip: true,
      userAgent: true,
      lastSeenAt: true,
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
    ip: s.ip,
    userAgent: s.userAgent,
    lastSeenAt: s.lastSeenAt,
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

export async function revokeSessionById(
  prisma: PrismaService,
  userId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  return await prisma.transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!session || session.userId !== userId) return false;

    if (session.revokedAt === null) {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          revokedAt: now,
          activeKey: null,
          pushPlatform: null,
          pushToken: null,
          pushTokenUpdatedAt: now,
          pushTokenRevokedAt: now,
        },
        select: { id: true },
      });
    } else {
      await tx.session.updateMany({
        where: { id: sessionId, userId },
        data: {
          activeKey: null,
          pushPlatform: null,
          pushToken: null,
          pushTokenUpdatedAt: now,
          pushTokenRevokedAt: now,
        },
      });
    }

    await tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });

    return true;
  });
}

export async function upsertSessionPushToken(
  prisma: PrismaService,
  input: {
    userId: string;
    sessionId: string;
    platform: SessionPushPlatform;
    token: string;
    now: Date;
  },
): Promise<UpsertSessionPushTokenResult> {
  const client = prisma.getClient();
  const platform = toPrismaPushPlatform(input.platform);

  return await withSerializableRetry(
    client,
    async (tx) => {
      // Validate (and lock) the caller's session first. This prevents a revoked/expired/nonexistent
      // session from clearing another session's push token.
      const locked = await tx.session.updateMany({
        where: {
          id: input.sessionId,
          userId: input.userId,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: {
          pushTokenUpdatedAt: input.now,
        },
      });

      if (locked.count !== 1) return { kind: 'session_not_found' };

      // Ensure a token is attached to at most one session (supports account switching on the same
      // device/app install). This runs only after the caller's session is validated.
      await tx.session.updateMany({
        where: { pushToken: input.token, id: { not: input.sessionId } },
        data: {
          pushPlatform: null,
          pushToken: null,
          pushTokenUpdatedAt: input.now,
          pushTokenRevokedAt: input.now,
        },
      });

      await tx.session.update({
        where: { id: input.sessionId },
        data: {
          pushPlatform: platform,
          pushToken: input.token,
          pushTokenUpdatedAt: input.now,
          pushTokenRevokedAt: null,
        },
        select: { id: true },
      });

      return { kind: 'ok' };
    },
    {
      shouldRetry: (err) =>
        isRetryableTransactionError(err) || isUniqueConstraintError(err, 'pushToken'),
    },
  );
}

export async function revokeSessionPushToken(
  prisma: PrismaService,
  input: {
    userId: string;
    sessionId: string;
    now: Date;
  },
): Promise<void> {
  const client = prisma.getClient();
  await client.session.updateMany({
    where: { id: input.sessionId, userId: input.userId },
    data: {
      pushPlatform: null,
      pushToken: null,
      pushTokenUpdatedAt: input.now,
      pushTokenRevokedAt: input.now,
    },
  });
}

export async function revokeActiveSessionForDevice(
  prisma: PrismaService,
  userId: string,
  activeKey: string,
  now: Date,
): Promise<void> {
  await prisma.transaction(async (tx) => {
    const existing = await tx.session.findUnique({
      where: { activeKey },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!existing || existing.userId !== userId || existing.revokedAt !== null) return;

    await tx.session.update({
      where: { id: existing.id },
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
      where: { sessionId: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}

export async function createSession(
  prisma: PrismaService,
  input: CreateSessionInput,
): Promise<SessionRecord> {
  const client = prisma.getClient();
  const session = await client.session.create({
    data: {
      userId: input.userId,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      activeKey: input.activeKey,
      lastSeenAt: input.lastSeenAt,
      expiresAt: input.sessionExpiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  return { id: session.id, expiresAt: session.expiresAt };
}
