import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformRbacModule } from '../../../platform/rbac/rbac.module';
import { AdminUsersService } from '../app/admin-users.service';
import { AdminUsersController } from './http/admin-users.controller';
import { AdminWhoamiController } from './http/whoami.controller';
import { PrismaAdminUsersRepository } from './persistence/prisma-admin-users.repository';

@Module({
  imports: [PrismaModule, PlatformAuthModule, PlatformRbacModule],
  controllers: [AdminWhoamiController, AdminUsersController],
  providers: [
    PrismaAdminUsersRepository,
    {
      provide: AdminUsersService,
      inject: [PrismaAdminUsersRepository],
      useFactory: (repo: PrismaAdminUsersRepository) => new AdminUsersService(repo),
    },
  ],
})
export class AdminModule {}
