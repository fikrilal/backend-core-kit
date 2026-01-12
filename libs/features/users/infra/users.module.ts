import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { QueueModule } from '../../../platform/queue/queue.module';
import { UsersService } from '../app/users.service';
import { MeController } from './http/me.controller';
import { PrismaUsersRepository } from './persistence/prisma-users.repository';
import { UserAccountDeletionController } from './http/user-account-deletion.controller';
import { UserAccountDeletionJobs } from './jobs/user-account-deletion.jobs';

@Module({
  imports: [PrismaModule, PlatformAuthModule, QueueModule],
  controllers: [MeController, UserAccountDeletionController],
  providers: [
    PrismaUsersRepository,
    UserAccountDeletionJobs,
    {
      provide: UsersService,
      inject: [PrismaUsersRepository, UserAccountDeletionJobs],
      useFactory: (usersRepo: PrismaUsersRepository, deletion: UserAccountDeletionJobs) =>
        new UsersService(usersRepo, deletion),
    },
  ],
})
export class UsersModule {}
