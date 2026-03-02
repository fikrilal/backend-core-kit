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
import { AuthSessionsService } from '../app/auth-sessions.service';
import { AuthPushTokensService } from '../app/auth-push-tokens.service';
import { AuthSessionLifecycleService } from '../app/auth-session-lifecycle.service';
import { AuthPasswordAuthService } from '../app/auth-password-auth.service';
import { AuthOidcAuthService } from '../app/auth-oidc-auth.service';
import { AuthEmailVerificationService } from '../app/auth-email-verification.service';
import { AuthPasswordResetService } from '../app/auth-password-reset.service';
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
import {
  provideAppService,
  provideClockedAppService,
  provideConstructedAppService,
  provideConstructedClockedAppService,
} from '../../../platform/di/app-service.provider';
import type { AuthConfig } from '../app/auth.config';
import { AUTH_CONFIG, AUTH_DUMMY_PASSWORD_HASH } from './auth.tokens';

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
    provideConstructedClockedAppService({
      provide: AuthSessionsService,
      inject: [PrismaAuthRepository],
      useClass: AuthSessionsService,
    }),
    provideConstructedClockedAppService({
      provide: AuthPushTokensService,
      inject: [PrismaAuthRepository],
      useClass: AuthPushTokensService,
    }),
    provideAppService({
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      factory: (config: ConfigService): AuthConfig => ({
        accessTokenTtlSeconds: config.get<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ?? 900,
        refreshTokenTtlSeconds:
          config.get<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') ?? 60 * 60 * 24 * 30,
        passwordMinLength: config.get<number>('AUTH_PASSWORD_MIN_LENGTH') ?? 10,
      }),
    }),
    provideAppService({
      provide: AUTH_DUMMY_PASSWORD_HASH,
      inject: [Argon2PasswordHasher],
      factory: async (passwordHasher: Argon2PasswordHasher) =>
        await passwordHasher.hash('dummy-password-for-timing'),
    }),
    provideClockedAppService<
      AuthSessionLifecycleService,
      [PrismaAuthRepository, CryptoAccessTokenIssuer, AuthConfig]
    >({
      provide: AuthSessionLifecycleService,
      inject: [PrismaAuthRepository, CryptoAccessTokenIssuer, AUTH_CONFIG],
      factory: (
        repo: PrismaAuthRepository,
        accessTokens: CryptoAccessTokenIssuer,
        config: AuthConfig,
        clock,
      ) => new AuthSessionLifecycleService(repo, accessTokens, clock, config),
    }),
    provideClockedAppService<
      AuthPasswordAuthService,
      [
        PrismaAuthRepository,
        Argon2PasswordHasher,
        RedisLoginRateLimiter,
        string,
        AuthConfig,
        AuthSessionLifecycleService,
      ]
    >({
      provide: AuthPasswordAuthService,
      inject: [
        PrismaAuthRepository,
        Argon2PasswordHasher,
        RedisLoginRateLimiter,
        AUTH_DUMMY_PASSWORD_HASH,
        AUTH_CONFIG,
        AuthSessionLifecycleService,
      ],
      factory: (
        repo: PrismaAuthRepository,
        passwordHasher: Argon2PasswordHasher,
        loginRateLimiter: RedisLoginRateLimiter,
        dummyPasswordHash: string,
        config: AuthConfig,
        sessions: AuthSessionLifecycleService,
        clock,
      ) =>
        new AuthPasswordAuthService(
          repo,
          passwordHasher,
          loginRateLimiter,
          clock,
          dummyPasswordHash,
          config,
          sessions,
        ),
    }),
    provideClockedAppService<
      AuthOidcAuthService,
      [PrismaAuthRepository, GoogleOidcIdTokenVerifier, AuthSessionLifecycleService]
    >({
      provide: AuthOidcAuthService,
      inject: [PrismaAuthRepository, GoogleOidcIdTokenVerifier, AuthSessionLifecycleService],
      factory: (
        repo: PrismaAuthRepository,
        oidcVerifier: GoogleOidcIdTokenVerifier,
        sessions: AuthSessionLifecycleService,
        clock,
      ) => new AuthOidcAuthService(repo, oidcVerifier, clock, sessions),
    }),
    provideClockedAppService<AuthEmailVerificationService, [PrismaAuthRepository]>({
      provide: AuthEmailVerificationService,
      inject: [PrismaAuthRepository],
      factory: (repo: PrismaAuthRepository, clock) => new AuthEmailVerificationService(repo, clock),
    }),
    provideClockedAppService<
      AuthPasswordResetService,
      [PrismaAuthRepository, Argon2PasswordHasher, AuthConfig]
    >({
      provide: AuthPasswordResetService,
      inject: [PrismaAuthRepository, Argon2PasswordHasher, AUTH_CONFIG],
      factory: (
        repo: PrismaAuthRepository,
        passwordHasher: Argon2PasswordHasher,
        config: AuthConfig,
        clock,
      ) => new AuthPasswordResetService(repo, passwordHasher, clock, config),
    }),
    provideConstructedAppService({
      provide: AuthService,
      inject: [
        AuthSessionLifecycleService,
        AuthPasswordAuthService,
        AuthOidcAuthService,
        AuthEmailVerificationService,
        AuthPasswordResetService,
      ],
      useClass: AuthService,
    }),
  ],
  exports: [AuthService],
})
export class AuthModule {}
