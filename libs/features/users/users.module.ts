import { Module } from '@nestjs/common';
import { PrismaModule } from '../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../platform/auth/auth.module';
import { PlatformEmailModule } from '../../platform/email/email.module';
import { QueueModule } from '../../platform/queue/queue.module';
import { RedisModule } from '../../platform/redis/redis.module';
import { PlatformStorageModule } from '../../platform/storage/storage.module';
import { MeController } from './me/me.controller';
import { MeService } from './me/me.service';
import { UserAccountDeletionController } from './account-deletion/account-deletion.controller';
import { AccountDeletionService } from './account-deletion/account-deletion.service';
import { UserAccountDeletionJobs } from './account-deletion/user-account-deletion.jobs';
import { UserAccountDeletionEmailJobs } from './account-deletion/user-account-deletion-email.jobs';
import { PrismaUsersRepository } from './shared/persistence/prisma-users.repository';
import { ProfileImageController } from './profile-image/profile-image.controller';
import { PrismaProfileImageRepository } from './shared/persistence/prisma-profile-image.repository';
import { UserProfileImageService } from './profile-image/profile-image.service';
import { RedisProfileImageUploadRateLimiter } from './profile-image/redis-profile-image-upload-rate-limiter';
import { ProfileImageCleanupJobs } from './profile-image/profile-image-cleanup.jobs';
import { USERS_CLOCK } from './shared/users.tokens';
import { UsersProfileImageStorageAdapter } from './profile-image/profile-image.storage';
import {
  provideConstructedAppService,
  provideSystemClockToken,
} from '../../platform/di/app-service.provider';

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
    UsersProfileImageStorageAdapter,
    provideSystemClockToken(USERS_CLOCK),
    provideConstructedAppService({
      provide: MeService,
      inject: [PrismaUsersRepository],
      useClass: MeService,
    }),
    provideConstructedAppService({
      provide: AccountDeletionService,
      inject: [PrismaUsersRepository, UserAccountDeletionJobs, USERS_CLOCK],
      useClass: AccountDeletionService,
    }),
    provideConstructedAppService({
      provide: UserProfileImageService,
      inject: [PrismaProfileImageRepository, UsersProfileImageStorageAdapter, USERS_CLOCK],
      useClass: UserProfileImageService,
    }),
  ],
  exports: [MeService],
})
export class UsersModule {}
