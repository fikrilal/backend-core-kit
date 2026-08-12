import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import type { Permission, PermissionsProvider } from './permissions';
import { RBAC_PERMISSIONS_PROVIDER, hasAllPermissions, normalizePermissions } from './permissions';
import { getRequiredPermissions, USE_DB_ROLES_KEY } from './rbac.decorator';
import { DbRoleHydrator } from './db-role-hydrator.service';

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

    const required: Permission[] = getRequiredPermissions(this.reflector, [cls, handler]);
    if (required.length === 0) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    let principal = req.principal;
    if (!principal) {
      throw new ProblemException(401, { title: 'Unauthorized', code: ErrorCode.UNAUTHORIZED });
    }

    const useDbRoles = this.reflector.getAllAndOverride<boolean>(USE_DB_ROLES_KEY, [handler, cls]);

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
}
