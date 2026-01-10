import { Module } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';
import { RBAC_PERMISSIONS_PROVIDER } from './rbac.tokens';
import { StaticRolePermissionsProvider } from './static-role-permissions.provider';

@Module({
  providers: [
    StaticRolePermissionsProvider,
    { provide: RBAC_PERMISSIONS_PROVIDER, useExisting: StaticRolePermissionsProvider },
    RbacGuard,
  ],
  exports: [RBAC_PERMISSIONS_PROVIDER, StaticRolePermissionsProvider, RbacGuard],
})
export class PlatformRbacModule {}
