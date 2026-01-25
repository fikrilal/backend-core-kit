import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PlatformEmailModule } from '../../../platform/email/email.module';
import { QueueModule } from '../../../platform/queue/queue.module';
import { RedisModule } from '../../../platform/redis/redis.module';
import { PlatformStorageModule } from '../../../platform/storage/storage.module';
import { UsersService } from '../app/users.service';
import { MeController } from './http/me.controller';
import { PrismaUsersRepository } from './persistence/prisma-users.repository';
import { UserAccountDeletionController } from './http/user-account-deletion.controller';
import { UserAccountDeletionJobs } from './jobs/user-account-deletion.jobs';
import { UserAccountDeletionEmailJobs } from './jobs/user-account-deletion-email.jobs';
import { ProfileImageController } from './http/profile-image.controller';
import { PrismaProfileImageRepository } from './persistence/prisma-profile-image.repository';
import { UserProfileImageService } from '../app/user-profile-image.service';
import { ObjectStorageService } from '../../../platform/storage/object-storage.service';
import { RedisProfileImageUploadRateLimiter } from './rate-limit/redis-profile-image-upload-rate-limiter';
import { ProfileImageCleanupJobs } from './jobs/profile-image-cleanup.jobs';
import type { Clock } from '../app/time';
import { SystemClock } from '../app/time';
import { USERS_CLOCK } from './users.tokens';

@Module({
  imports: [
    PrismaModule,
    PlatformAuthModule,
    PlatformEmailModule,
    PlatformStorageModule,
    QueueModule,
    RedisModule,
  ],
  controllers: [MeController, ProfileImageController, UserAccountDeletionController],
  providers: [
    PrismaUsersRepository,
    PrismaProfileImageRepository,
    UserAccountDeletionJobs,
    UserAccountDeletionEmailJobs,
    RedisProfileImageUploadRateLimiter,
    ProfileImageCleanupJobs,
    { provide: USERS_CLOCK, useValue: new SystemClock() },
    {
      provide: UsersService,
      inject: [PrismaUsersRepository, UserAccountDeletionJobs, USERS_CLOCK],
      useFactory: (
        usersRepo: PrismaUsersRepository,
        deletion: UserAccountDeletionJobs,
        clock: Clock,
      ) => new UsersService(usersRepo, deletion, clock),
    },
    {
      provide: UserProfileImageService,
      inject: [PrismaProfileImageRepository, ObjectStorageService, USERS_CLOCK],
      useFactory: (
        repo: PrismaProfileImageRepository,
        storage: ObjectStorageService,
        clock: Clock,
      ) => new UserProfileImageService(repo, storage, clock),
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
