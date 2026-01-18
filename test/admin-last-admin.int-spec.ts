import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../libs/platform/db/prisma.service';
import { PrismaAdminUsersRepository } from '../libs/features/admin/infra/persistence/prisma-admin-users.repository';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

(shouldSkip ? describe.skip : describe)('Admin last-admin invariants (int)', () => {
  let prisma: PrismaService;
  let repo: PrismaAdminUsersRepository;
  const createdUserIds: string[] = [];
  const createdTraceIds: string[] = [];
  const demotedAdminIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(stubConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }));
    await prisma.ping();
    repo = new PrismaAdminUsersRepository(prisma);
  });

  afterEach(async () => {
    const client = prisma.getClient();

    while (demotedAdminIds.length) {
      const userId = demotedAdminIds.pop();
      if (!userId) continue;
      await client.user.updateMany({ where: { id: userId }, data: { role: UserRole.ADMIN } });
    }

    while (createdTraceIds.length) {
      const traceId = createdTraceIds.pop();
      if (!traceId) continue;
      await client.userRoleChangeAudit.deleteMany({ where: { traceId } });
    }

    while (createdUserIds.length) {
      const userId = createdUserIds.pop();
      if (!userId) continue;
      await client.user.deleteMany({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('concurrent admin demotions cannot leave the system with zero active admins', async () => {
    const client = prisma.getClient();
    const runId = randomUUID();

    const [adminA, adminB] = await Promise.all([
      client.user.create({
        data: {
          email: `admin-last-a+${runId}@example.com`,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      }),
      client.user.create({
        data: {
          email: `admin-last-b+${runId}@example.com`,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);

    createdUserIds.push(adminA.id, adminB.id);

    const otherAdmins = await client.user.findMany({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        id: { notIn: [adminA.id, adminB.id] },
      },
      select: { id: true },
    });
    demotedAdminIds.push(...otherAdmins.map((u) => u.id));
    if (otherAdmins.length) {
      await client.user.updateMany({
        where: { id: { in: otherAdmins.map((u) => u.id) } },
        data: { role: UserRole.USER },
      });
    }

    const traceA = `trace-${randomUUID()}`;
    const traceB = `trace-${randomUUID()}`;
    createdTraceIds.push(traceA, traceB);

    const [resA, resB] = await Promise.all([
      repo.setUserRole({
        actorUserId: adminA.id,
        actorSessionId: randomUUID(),
        targetUserId: adminA.id,
        role: 'USER',
        traceId: traceA,
      }),
      repo.setUserRole({
        actorUserId: adminB.id,
        actorSessionId: randomUUID(),
        targetUserId: adminB.id,
        role: 'USER',
        traceId: traceB,
      }),
    ]);

    expect([resA.kind, resB.kind]).toEqual(expect.arrayContaining(['ok']));

    const after = await client.user.findMany({
      where: { id: { in: [adminA.id, adminB.id] } },
      select: { id: true, role: true },
    });
    expect(after).toHaveLength(2);

    const adminCount = after.filter((u) => u.role === UserRole.ADMIN).length;
    const userCount = after.filter((u) => u.role === UserRole.USER).length;

    expect(adminCount).toBe(1);
    expect(userCount).toBe(1);
  });
});
