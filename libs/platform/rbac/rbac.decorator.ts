import { SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Permission } from './permissions';
import { normalizePermissions } from './permissions';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const USE_DB_ROLES_KEY = 'rbac:useDbRoles';

export function RequirePermissions(...permissions: Permission[]): ClassDecorator & MethodDecorator {
  return SetMetadata(REQUIRE_PERMISSIONS_KEY, normalizePermissions(permissions));
}

export function UseDbRoles(): ClassDecorator & MethodDecorator {
  return SetMetadata(USE_DB_ROLES_KEY, true);
}

type ReflectorTarget = Parameters<Reflector['getAllAndMerge']>[1][number];

export function getRequiredPermissions(
  reflector: Reflector,
  targets: ReadonlyArray<ReflectorTarget>,
): Permission[] {
  const merged = reflector.getAllAndMerge<Permission[]>(REQUIRE_PERMISSIONS_KEY, [...targets]);
  return normalizePermissions(Array.isArray(merged) ? merged : []);
}
