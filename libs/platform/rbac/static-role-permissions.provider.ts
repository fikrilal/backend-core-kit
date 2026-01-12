import { Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import type { Permission } from './permissions';
import { normalizePermissions } from './permissions';
import type { PermissionsProvider } from './permissions.provider';

const ROLE_PERMISSIONS: Readonly<Record<string, ReadonlyArray<Permission>>> = Object.freeze({
  USER: [],
  ADMIN: [
    'admin:access',
    'users:read',
    'users:role:write',
    'users:status:write',
    'audit:user-role-changes:read',
  ],
});

@Injectable()
export class StaticRolePermissionsProvider implements PermissionsProvider {
  getPermissions(principal: AuthPrincipal): ReadonlyArray<Permission> {
    const out: Permission[] = [];

    for (const role of principal.roles) {
      const perms = ROLE_PERMISSIONS[role];
      if (!perms) continue;
      out.push(...perms);
    }

    return normalizePermissions(out);
  }
}
