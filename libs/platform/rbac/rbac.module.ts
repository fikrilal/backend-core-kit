import { Module } from '@nestjs/common';
import { PrismaModule } from '../db/prisma.module';
import { RBAC_PERMISSIONS_PROVIDER } from './permissions';
import { DbRoleHydrator } from './db-role-hydrator.service';
import { RbacGuard } from './rbac.guard';
import { StaticRolePermissionsProvider } from './static-role-permissions.provider';

@Module({
  imports: [PrismaModule],
  providers: [
    StaticRolePermissionsProvider,
    { provide: RBAC_PERMISSIONS_PROVIDER, useExisting: StaticRolePermissionsProvider },
    DbRoleHydrator,
    RbacGuard,
  ],
  exports: [RBAC_PERMISSIONS_PROVIDER, StaticRolePermissionsProvider, DbRoleHydrator, RbacGuard],
})
export class PlatformRbacModule {}
