import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { UsersService } from '../app/users.service';
import { MeController } from './http/me.controller';
import { PrismaUsersRepository } from './persistence/prisma-users.repository';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [MeController],
  providers: [
    PrismaUsersRepository,
    {
      provide: UsersService,
      inject: [PrismaUsersRepository],
      useFactory: (usersRepo: PrismaUsersRepository) => new UsersService(usersRepo),
    },
  ],
})
export class UsersModule {}
