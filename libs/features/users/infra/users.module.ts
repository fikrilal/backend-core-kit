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
    {
      provide: UsersService,
      inject: [PrismaUsersRepository, UserAccountDeletionJobs],
      useFactory: (usersRepo: PrismaUsersRepository, deletion: UserAccountDeletionJobs) =>
        new UsersService(usersRepo, deletion),
    },
    {
      provide: UserProfileImageService,
      inject: [PrismaProfileImageRepository, ObjectStorageService],
      useFactory: (repo: PrismaProfileImageRepository, storage: ObjectStorageService) =>
        new UserProfileImageService(repo, storage),
    },
  ],
})
export class UsersModule {}
