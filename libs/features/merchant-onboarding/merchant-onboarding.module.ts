import { Module } from '@nestjs/common';
import { PrismaModule } from '../../platform/db/prisma.module';
import { PlatformAuthModule } from '../../platform/auth/auth.module';
import { provideConstructedClockedAppService } from '../../platform/di/app-service.provider';
import { MerchantOnboardingController } from './merchant-onboarding.controller';
import { PrismaMerchantOnboardingRepository } from './prisma-merchant-onboarding.repository';
import { MerchantOnboardingService } from './merchant-onboarding.service';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [MerchantOnboardingController],
  providers: [
    PrismaMerchantOnboardingRepository,
    provideConstructedClockedAppService({
      provide: MerchantOnboardingService,
      inject: [PrismaMerchantOnboardingRepository],
      useClass: MerchantOnboardingService,
    }),
  ],
})
export class MerchantOnboardingModule {}
