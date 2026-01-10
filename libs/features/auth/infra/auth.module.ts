import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { RedisModule } from '../../../platform/redis/redis.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { AuthService } from '../app/auth.service';
import { SystemClock } from '../app/time';
import { AuthController } from './http/auth.controller';
import { JwksController } from './http/jwks.controller';
import { PrismaAuthRepository } from './persistence/prisma-auth.repository';
import { RedisLoginRateLimiter } from './rate-limit/redis-login-rate-limiter';
import { Argon2PasswordHasher } from './security/argon2.password-hasher';
import { CryptoAccessTokenIssuer } from './security/crypto-access-token-issuer';

@Module({
  imports: [PrismaModule, RedisModule, PlatformAuthModule],
  controllers: [AuthController, JwksController],
  providers: [
    PrismaAuthRepository,
    Argon2PasswordHasher,
    CryptoAccessTokenIssuer,
    RedisLoginRateLimiter,
    {
      provide: AuthService,
      inject: [
        PrismaAuthRepository,
        Argon2PasswordHasher,
        CryptoAccessTokenIssuer,
        RedisLoginRateLimiter,
        ConfigService,
      ],
      useFactory: (
        repo: PrismaAuthRepository,
        passwordHasher: Argon2PasswordHasher,
        accessTokens: CryptoAccessTokenIssuer,
        loginRateLimiter: RedisLoginRateLimiter,
        config: ConfigService,
      ) =>
        new AuthService(repo, passwordHasher, accessTokens, loginRateLimiter, new SystemClock(), {
          accessTokenTtlSeconds: config.get<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ?? 900,
          refreshTokenTtlSeconds:
            config.get<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') ?? 60 * 60 * 24 * 30,
          passwordMinLength: config.get<number>('AUTH_PASSWORD_MIN_LENGTH') ?? 10,
        }),
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
