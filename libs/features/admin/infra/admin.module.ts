import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformRbacModule } from '../../../platform/rbac/rbac.module';
import { AdminAuditService } from '../app/admin-audit.service';
import { AdminUsersService } from '../app/admin-users.service';
import { AdminAuditController } from './http/admin-audit.controller';
import { AdminUsersController } from './http/admin-users.controller';
import { AdminWhoamiController } from './http/whoami.controller';
import { PrismaAdminAuditRepository } from './persistence/prisma-admin-audit.repository';
import { PrismaAdminUsersRepository } from './persistence/prisma-admin-users.repository';

@Module({
  imports: [PrismaModule, PlatformAuthModule, PlatformRbacModule],
  controllers: [AdminWhoamiController, AdminUsersController, AdminAuditController],
  providers: [
    PrismaAdminUsersRepository,
    {
      provide: AdminUsersService,
      inject: [PrismaAdminUsersRepository],
      useFactory: (repo: PrismaAdminUsersRepository) => new AdminUsersService(repo),
    },
    PrismaAdminAuditRepository,
    {
      provide: AdminAuditService,
      inject: [PrismaAdminAuditRepository],
      useFactory: (repo: PrismaAdminAuditRepository) => new AdminAuditService(repo),
    },
  ],
})
export class AdminModule {}
