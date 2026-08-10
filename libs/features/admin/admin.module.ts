import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../platform/auth/auth.module';
import { PrismaModule } from '../../platform/db/prisma.module';
import { PlatformRbacModule } from '../../platform/rbac/rbac.module';
import { AdminAuditService } from './admin-audit/admin-audit.service';
import { AdminUsersService } from './admin-users/admin-users.service';
import { AdminAuditController } from './admin-audit/admin-audit.controller';
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminWhoamiController } from './whoami/whoami.controller';
import { PrismaAdminAuditRepository } from './shared/persistence/prisma-admin-audit.repository';
import { PrismaAdminUsersRepository } from './shared/persistence/prisma-admin-users.repository';
import { provideConstructedAppService } from '../../platform/di/app-service.provider';

@Module({
  imports: [PrismaModule, PlatformAuthModule, PlatformRbacModule],
  controllers: [AdminWhoamiController, AdminUsersController, AdminAuditController],
  providers: [
    PrismaAdminUsersRepository,
    provideConstructedAppService({
      provide: AdminUsersService,
      inject: [PrismaAdminUsersRepository],
      useClass: AdminUsersService,
    }),
    PrismaAdminAuditRepository,
    provideConstructedAppService({
      provide: AdminAuditService,
      inject: [PrismaAdminAuditRepository],
      useClass: AdminAuditService,
    }),
  ],
})
export class AdminModule {}
