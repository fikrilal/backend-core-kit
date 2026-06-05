import { DbRoleHydrator } from './db-role-hydrator.service';
import { PrismaService } from '../db/prisma.service';
import { ProblemException } from '../http/errors/problem.exception';
import type { AuthPrincipal } from '../auth/auth.types';
import { AuthErrorCode } from '../../shared/auth/auth-error-codes';
import { createPrototypeStub } from '../../../test/support/stubs';

function expectProblem(err: unknown, status: number, code: string): void {
  if (!(err instanceof ProblemException)) {
    throw new Error(`Expected ProblemException, got: ${String(err)}`);
  }
  expect(err.getStatus()).toBe(status);
  const body = err.getResponse();
  expect(body).toMatchObject({ code });
}

describe('DbRoleHydrator', () => {
  const basePrincipal: AuthPrincipal = {
    userId: 'user-1',
    sessionId: 'session-1',
    emailVerified: false,
    roles: ['USER'],
  };

  it('throws 500 when Prisma is disabled', async () => {
    const prisma = createPrototypeStub(PrismaService, { isEnabled: () => false });
    const hydrator = new DbRoleHydrator(prisma);

    let err: unknown;
    try {
      await hydrator.hydrate(basePrincipal);
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 500, 'INTERNAL');
  });

  it('throws 401 when user is not found', async () => {
    const prisma = createPrototypeStub(PrismaService, {
      isEnabled: () => true,
      getClient: () => ({
        user: { findUnique: async () => null },
      }),
    });
    const hydrator = new DbRoleHydrator(prisma);

    let err: unknown;
    try {
      await hydrator.hydrate(basePrincipal);
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 401, 'UNAUTHORIZED');
  });

  it('throws 403 AUTH_USER_SUSPENDED when user is suspended', async () => {
    const prisma = createPrototypeStub(PrismaService, {
      isEnabled: () => true,
      getClient: () => ({
        user: { findUnique: async () => ({ role: 'USER', status: 'SUSPENDED' }) },
      }),
    });
    const hydrator = new DbRoleHydrator(prisma);

    let err: unknown;
    try {
      await hydrator.hydrate(basePrincipal);
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 403, AuthErrorCode.AUTH_USER_SUSPENDED);
  });

  it('throws 401 when user is deleted', async () => {
    const prisma = createPrototypeStub(PrismaService, {
      isEnabled: () => true,
      getClient: () => ({
        user: { findUnique: async () => ({ role: 'USER', status: 'DELETED' }) },
      }),
    });
    const hydrator = new DbRoleHydrator(prisma);

    let err: unknown;
    try {
      await hydrator.hydrate(basePrincipal);
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 401, 'UNAUTHORIZED');
  });

  it('overrides principal roles from DB when active', async () => {
    const prisma = createPrototypeStub(PrismaService, {
      isEnabled: () => true,
      getClient: () => ({
        user: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE' }) },
      }),
    });
    const hydrator = new DbRoleHydrator(prisma);

    await expect(hydrator.hydrate(basePrincipal)).resolves.toEqual({
      ...basePrincipal,
      roles: ['ADMIN'],
    });
  });

  it('maps unexpected Prisma errors to 500 INTERNAL', async () => {
    const prisma = createPrototypeStub(PrismaService, {
      isEnabled: () => true,
      getClient: () => {
        throw new Error('db down');
      },
    });
    const hydrator = new DbRoleHydrator(prisma);

    let err: unknown;
    try {
      await hydrator.hydrate(basePrincipal);
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 500, 'INTERNAL');
  });
});
