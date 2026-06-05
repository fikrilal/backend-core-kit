import { Reflector } from '@nestjs/core';
import { Public } from '../auth/public.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import { DbRoleHydrator } from './db-role-hydrator.service';
import { RequirePermissions, getRequiredPermissions } from './rbac.decorator';
import { RbacGuard } from './rbac.guard';
import type { PermissionsProvider } from './permissions.provider';
import { SkipRbac } from './skip-rbac.decorator';
import { StaticRolePermissionsProvider } from './static-role-permissions.provider';
import { UseDbRoles } from './use-db-roles.decorator';
import { createHttpExecutionContext } from '../../../test/support/http';
import { createPrototypeStub } from '../../../test/support/stubs';

type RequestLike = {
  url: string;
  headers: Record<string, string>;
  principal?: AuthPrincipal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ctxFor(params: {
  handler: (...args: unknown[]) => unknown;
  cls: new (...args: unknown[]) => unknown;
  req: RequestLike;
}) {
  return createHttpExecutionContext({
    handler: params.handler,
    cls: params.cls,
    request: params.req,
  });
}

function getProblem(err: unknown): { status: number; code: unknown } {
  if (!(err instanceof ProblemException)) {
    throw new Error(`Expected ProblemException, got: ${String(err)}`);
  }
  const body = err.getResponse();
  const code = isRecord(body) ? body.code : undefined;
  return { status: err.getStatus(), code };
}

describe('getRequiredPermissions', () => {
  it('merges controller-level + handler-level requirements and dedupes', () => {
    @RequirePermissions('users:read')
    class Controller {
      @RequirePermissions('users:read', 'users:write')
      handler(): void {}
    }

    const reflector = new Reflector();
    const required = getRequiredPermissions(reflector, [Controller, Controller.prototype.handler]);
    expect(required).toEqual(['users:read', 'users:write']);
  });
});

describe('RbacGuard', () => {
  it('skips RBAC for @Public() endpoints', async () => {
    @Public()
    @RequirePermissions('admin:access')
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider: PermissionsProvider = { getPermissions: jest.fn() };
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req: RequestLike = { url: '/v1/me', headers: {} };
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);
  });

  it('skips RBAC for @SkipRbac()', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      @SkipRbac()
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider: PermissionsProvider = { getPermissions: jest.fn() };
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req: RequestLike = { url: '/v1/me', headers: {}, principal: undefined };
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);
  });

  it('allows requests when no permissions are required', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider: PermissionsProvider = { getPermissions: jest.fn() };
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req: RequestLike = { url: '/v1/me', headers: {} };
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);
  });

  it('throws 401 when principal is missing on a protected endpoint', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider: PermissionsProvider = { getPermissions: jest.fn() };
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req: RequestLike = { url: '/v1/me', headers: {} };

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expect(getProblem(err)).toEqual({ status: 401, code: ErrorCode.UNAUTHORIZED });
  });

  it('throws 403 when required permissions are not granted', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider: PermissionsProvider = { getPermissions: () => [] };
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req: RequestLike = { url: '/v1/me', headers: {}, principal };

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expect(getProblem(err)).toEqual({ status: 403, code: ErrorCode.FORBIDDEN });
  });

  it('hydrates DB roles automatically for /v1/admin/* paths before permission checks', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider = new StaticRolePermissionsProvider();
    const hydrator = createPrototypeStub(DbRoleHydrator, {
      hydrate: jest.fn(async (p: AuthPrincipal) => ({ ...p, roles: ['ADMIN'] })),
    });

    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req: RequestLike = { url: '/v1/admin/whoami', headers: {}, principal };
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);

    expect(hydrator.hydrate).toHaveBeenCalledWith(principal);
    expect(req.principal?.roles).toEqual(['ADMIN']);
  });

  it('hydrates DB roles when @UseDbRoles() is set (non-admin path)', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      @UseDbRoles()
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider = new StaticRolePermissionsProvider();
    const hydrator = createPrototypeStub(DbRoleHydrator, {
      hydrate: jest.fn(async (p: AuthPrincipal) => ({ ...p, roles: ['ADMIN'] })),
    });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req: RequestLike = { url: '/v1/me', headers: {}, principal };
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);

    expect(hydrator.hydrate).toHaveBeenCalledWith(principal);
  });

  it('denies unknown roles by default (no permissions granted)', async () => {
    @RequirePermissions('admin:access')
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const provider = new StaticRolePermissionsProvider();
    const hydrator = createPrototypeStub(DbRoleHydrator, { hydrate: jest.fn() });
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['UNKNOWN_ROLE'],
    };

    const req: RequestLike = { url: '/v1/me', headers: {}, principal };

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expect(getProblem(err)).toEqual({ status: 403, code: ErrorCode.FORBIDDEN });
  });
});
