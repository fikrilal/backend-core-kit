import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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

type HandlerFn = (...args: unknown[]) => unknown;
type ClassConstructor = new (...args: unknown[]) => unknown;

function ctxFor(params: {
  handler: HandlerFn;
  cls: ClassConstructor;
  req: FastifyRequest;
}): ExecutionContext {
  return {
    getHandler: () => params.handler,
    getClass: () => params.cls,
    switchToHttp: () => ({
      getRequest: () => params.req,
    }),
  } as unknown as ExecutionContext;
}

function getProblem(err: unknown): { status: number; code: unknown } {
  if (!(err instanceof ProblemException)) {
    throw new Error(`Expected ProblemException, got: ${String(err)}`);
  }
  const body = err.getResponse();
  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? (body as { code?: unknown }).code
      : undefined;
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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req = { url: '/v1/me', headers: {} } as unknown as FastifyRequest;
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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req = { url: '/v1/me', headers: {}, principal: undefined } as unknown as FastifyRequest;
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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req = { url: '/v1/me', headers: {} } as unknown as FastifyRequest;
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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const req = { url: '/v1/me', headers: {} } as unknown as FastifyRequest;

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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req = { url: '/v1/me', headers: {}, principal } as unknown as FastifyRequest;

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
    const hydrator = {
      hydrate: jest.fn(async (p: AuthPrincipal) => ({ ...p, roles: ['ADMIN'] })),
    } as unknown as DbRoleHydrator;

    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req = { url: '/v1/admin/whoami', headers: {}, principal } as unknown as FastifyRequest;
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
    const hydrator = {
      hydrate: jest.fn(async (p: AuthPrincipal) => ({ ...p, roles: ['ADMIN'] })),
    } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };

    const req = { url: '/v1/me', headers: {}, principal } as unknown as FastifyRequest;
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
    const hydrator = { hydrate: jest.fn() } as unknown as DbRoleHydrator;
    const guard = new RbacGuard(reflector, provider, hydrator);

    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['UNKNOWN_ROLE'],
    };

    const req = { url: '/v1/me', headers: {}, principal } as unknown as FastifyRequest;

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
