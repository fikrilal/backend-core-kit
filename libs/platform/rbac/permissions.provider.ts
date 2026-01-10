import type { AuthPrincipal } from '../auth/auth.types';
import type { Permission } from './permissions';

export interface PermissionsProvider {
  getPermissions(
    principal: AuthPrincipal,
  ): ReadonlyArray<Permission> | Promise<ReadonlyArray<Permission>>;
}
