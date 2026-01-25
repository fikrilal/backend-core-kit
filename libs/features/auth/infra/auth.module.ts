import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { RedisModule } from '../../../platform/redis/redis.module';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PlatformEmailModule } from '../../../platform/email/email.module';
import { PlatformPushModule } from '../../../platform/push/push.module';
import { QueueModule } from '../../../platform/queue/queue.module';
import { UsersModule } from '../../users/infra/users.module';
import { AuthService } from '../app/auth.service';
import { SystemClock } from '../app/time';
import { AuthSessionsService } from '../app/auth-sessions.service';
import { AuthPushTokensService } from '../app/auth-push-tokens.service';
import { AuthController } from './http/auth.controller';
import { JwksController } from './http/jwks.controller';
import { MeSessionsController } from './http/me-sessions.controller';
import { MePushTokenController } from './http/me-push-token.controller';
import { PrismaAuthRepository } from './persistence/prisma-auth.repository';
import { AuthEmailVerificationJobs } from './jobs/auth-email-verification.jobs';
import { AuthPasswordResetJobs } from './jobs/auth-password-reset.jobs';
import { RedisEmailVerificationRateLimiter } from './rate-limit/redis-email-verification-rate-limiter';
import { RedisLoginRateLimiter } from './rate-limit/redis-login-rate-limiter';
import { RedisPasswordResetRateLimiter } from './rate-limit/redis-password-reset-rate-limiter';
import { Argon2PasswordHasher } from './security/argon2.password-hasher';
import { CryptoAccessTokenIssuer } from './security/crypto-access-token-issuer';
import { GoogleOidcIdTokenVerifier } from './security/google-oidc-id-token-verifier';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PlatformAuthModule,
    PlatformEmailModule,
    PlatformPushModule,
    QueueModule,
    UsersModule,
  ],
  controllers: [AuthController, JwksController, MeSessionsController, MePushTokenController],
  providers: [
    PrismaAuthRepository,
    AuthEmailVerificationJobs,
    AuthPasswordResetJobs,
    Argon2PasswordHasher,
    CryptoAccessTokenIssuer,
    GoogleOidcIdTokenVerifier,
    RedisEmailVerificationRateLimiter,
    RedisLoginRateLimiter,
    RedisPasswordResetRateLimiter,
    {
      provide: AuthSessionsService,
      inject: [PrismaAuthRepository],
      useFactory: (repo: PrismaAuthRepository) => new AuthSessionsService(repo, new SystemClock()),
    },
    {
      provide: AuthPushTokensService,
      inject: [PrismaAuthRepository],
      useFactory: (repo: PrismaAuthRepository) =>
        new AuthPushTokensService(repo, new SystemClock()),
    },
    {
      provide: AuthService,
      inject: [
        PrismaAuthRepository,
        Argon2PasswordHasher,
        CryptoAccessTokenIssuer,
        GoogleOidcIdTokenVerifier,
        RedisLoginRateLimiter,
        ConfigService,
      ],
      useFactory: async (
        repo: PrismaAuthRepository,
        passwordHasher: Argon2PasswordHasher,
        accessTokens: CryptoAccessTokenIssuer,
        oidcVerifier: GoogleOidcIdTokenVerifier,
        loginRateLimiter: RedisLoginRateLimiter,
        config: ConfigService,
      ) => {
        const dummyPasswordHash = await passwordHasher.hash('dummy-password-for-timing');

        return new AuthService(
          repo,
          passwordHasher,
          accessTokens,
          oidcVerifier,
          loginRateLimiter,
          new SystemClock(),
          dummyPasswordHash,
          {
            accessTokenTtlSeconds: config.get<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ?? 900,
            refreshTokenTtlSeconds:
              config.get<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') ?? 60 * 60 * 24 * 30,
            passwordMinLength: config.get<number>('AUTH_PASSWORD_MIN_LENGTH') ?? 10,
          },
        );
      },
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
