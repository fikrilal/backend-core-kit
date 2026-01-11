import { SetMetadata } from '@nestjs/common';

export const USE_DB_ROLES_KEY = 'rbac:useDbRoles';

export function UseDbRoles(): ClassDecorator & MethodDecorator {
  return SetMetadata(USE_DB_ROLES_KEY, true);
}
