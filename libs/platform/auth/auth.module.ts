import { Module } from '@nestjs/common';
import { AuthKeyRing } from './auth-keyring.service';
import { AccessTokenVerifier } from './access-token-verifier.service';
import { AccessTokenGuard } from './access-token.guard';

@Module({
  providers: [AuthKeyRing, AccessTokenVerifier, AccessTokenGuard],
  exports: [AuthKeyRing, AccessTokenVerifier, AccessTokenGuard],
})
export class PlatformAuthModule {}
