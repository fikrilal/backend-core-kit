import type { Reflector } from '@nestjs/core';
import type { Permission } from './permissions';
import { normalizePermissions } from './permissions';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

function getExistingPermissions(target: object): Permission[] {
  const existing = Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, target) as unknown;
  if (!Array.isArray(existing)) return [];
  return normalizePermissions(existing.filter((v): v is string => typeof v === 'string'));
}

export function RequirePermissions(...permissions: Permission[]): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const metaTarget = descriptor?.value ?? target;
    const current = getExistingPermissions(metaTarget);
    const next = normalizePermissions([...current, ...permissions]);
    Reflect.defineMetadata(REQUIRE_PERMISSIONS_KEY, next, metaTarget);
  };
}

type ReflectorTarget = Parameters<Reflector['getAllAndMerge']>[1][number];

export function getRequiredPermissions(
  reflector: Reflector,
  targets: ReadonlyArray<ReflectorTarget>,
): Permission[] {
  const merged = reflector.getAllAndMerge<Permission[]>(REQUIRE_PERMISSIONS_KEY, [...targets]);
  return normalizePermissions(Array.isArray(merged) ? merged : []);
}
