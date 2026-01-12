import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PlatformEmailModule } from '../../../platform/email/email.module';
import { QueueModule } from '../../../platform/queue/queue.module';
import { UsersService } from '../app/users.service';
import { MeController } from './http/me.controller';
import { PrismaUsersRepository } from './persistence/prisma-users.repository';
import { UserAccountDeletionController } from './http/user-account-deletion.controller';
import { UserAccountDeletionJobs } from './jobs/user-account-deletion.jobs';
import { UserAccountDeletionEmailJobs } from './jobs/user-account-deletion-email.jobs';

@Module({
  imports: [PrismaModule, PlatformAuthModule, PlatformEmailModule, QueueModule],
  controllers: [MeController, UserAccountDeletionController],
  providers: [
    PrismaUsersRepository,
    UserAccountDeletionJobs,
    UserAccountDeletionEmailJobs,
    {
      provide: UsersService,
      inject: [PrismaUsersRepository, UserAccountDeletionJobs],
      useFactory: (usersRepo: PrismaUsersRepository, deletion: UserAccountDeletionJobs) =>
        new UsersService(usersRepo, deletion),
    },
  ],
})
export class UsersModule {}
