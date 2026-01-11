import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import type { Permission } from './permissions';
import { hasAllPermissions, normalizePermissions } from './permissions';
import type { PermissionsProvider } from './permissions.provider';
import { getRequiredPermissions } from './rbac.decorator';
import { RBAC_PERMISSIONS_PROVIDER } from './rbac.tokens';
import { SKIP_RBAC_KEY } from './skip-rbac.decorator';
import { DbRoleHydrator } from './db-role-hydrator.service';
import { USE_DB_ROLES_KEY } from './use-db-roles.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RBAC_PERMISSIONS_PROVIDER) private readonly permissionsProvider: PermissionsProvider,
    private readonly dbRoleHydrator: DbRoleHydrator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, cls]);
    if (isPublic) return true;

    const skipRbac = this.reflector.getAllAndOverride<boolean>(SKIP_RBAC_KEY, [handler, cls]);
    if (skipRbac) return true;

    const required: Permission[] = getRequiredPermissions(this.reflector, [cls, handler]);
    if (required.length === 0) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    let principal = req.principal;
    if (!principal) {
      throw new ProblemException(401, { title: 'Unauthorized', code: ErrorCode.UNAUTHORIZED });
    }

    const useDbRoles =
      this.isAdminPath(req.url) ||
      this.reflector.getAllAndOverride<boolean>(USE_DB_ROLES_KEY, [handler, cls]) === true;

    if (useDbRoles) {
      principal = await this.dbRoleHydrator.hydrate(principal);
      req.principal = principal;
    }

    const grantedRaw = await this.permissionsProvider.getPermissions(principal);
    const granted = normalizePermissions(grantedRaw);

    if (!hasAllPermissions(granted, required)) {
      throw new ProblemException(403, { title: 'Forbidden', code: ErrorCode.FORBIDDEN });
    }

    return true;
  }

  private isAdminPath(url: string): boolean {
    const path = url.split('?', 1)[0] ?? '';
    return path === '/v1/admin' || path.startsWith('/v1/admin/');
  }
}
