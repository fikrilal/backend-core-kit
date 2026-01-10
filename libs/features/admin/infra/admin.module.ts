import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PlatformRbacModule } from '../../../platform/rbac/rbac.module';
import { AdminWhoamiController } from './http/whoami.controller';

@Module({
  imports: [PlatformAuthModule, PlatformRbacModule],
  controllers: [AdminWhoamiController],
})
export class AdminModule {}
