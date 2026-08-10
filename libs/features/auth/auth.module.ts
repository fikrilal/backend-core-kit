import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../platform/db/prisma.module';
import { RedisModule } from '../../platform/redis/redis.module';
import { PlatformAuthModule } from '../../platform/auth/auth.module';
import { PlatformEmailModule } from '../../platform/email/email.module';
import { PlatformPushModule } from '../../platform/push/push.module';
import { QueueModule } from '../../platform/queue/queue.module';
import { AUTH_CONFIG_DEFAULTS } from '../../platform/config/env.defaults';
import { UsersModule } from '../users/users.module';
import { EmailVerificationController } from './email-verification/email-verification.controller';
import { AuthEmailVerificationJobs } from './email-verification/email-verification.jobs';
import { AuthEmailVerificationService } from './email-verification/email-verification.service';
import { OidcController } from './oidc/oidc.controller';
import { AuthOidcAuthService } from './oidc/oidc-auth.service';
import { PasswordAuthController } from './password/password-auth.controller';
import { AuthPasswordAuthService } from './password/password-auth.service';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { AuthPasswordResetJobs } from './password-reset/password-reset.jobs';
import { AuthPasswordResetService } from './password-reset/password-reset.service';
import { MePushTokenController } from './push-tokens/push-token.controller';
import { AuthPushTokensService } from './push-tokens/push-tokens.service';
import { JwksController } from './sessions/jwks.controller';
import { AuthSessionsController, MeSessionsController } from './sessions/sessions.controller';
import { AuthSessionsService } from './sessions/sessions.service';
import { AuthSessionLifecycleService } from './sessions/session-lifecycle.service';
import { PrismaAuthRepository } from './shared/persistence/prisma-auth.repository';
import { RedisEmailVerificationRateLimiter } from './shared/rate-limit/redis-email-verification-rate-limiter';
import { RedisLoginRateLimiter } from './shared/rate-limit/redis-login-rate-limiter';
import { RedisPasswordResetRateLimiter } from './shared/rate-limit/redis-password-reset-rate-limiter';
import { Argon2PasswordHasher } from './shared/security/argon2.password-hasher';
import { CryptoAccessTokenIssuer } from './shared/security/crypto-access-token-issuer';
import { GoogleOidcIdTokenVerifier } from './shared/security/google-oidc-id-token-verifier';
import {
  provideAppService,
  provideClockedAppService,
  provideConstructedClockedAppService,
} from '../../platform/di/app-service.provider';
import type { AuthConfig } from './shared/auth.model';
import { AUTH_CONFIG, AUTH_DUMMY_PASSWORD_HASH } from './shared/auth.tokens';

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
  controllers: [
    OidcController,
    EmailVerificationController,
    PasswordResetController,
    PasswordAuthController,
    JwksController,
    MeSessionsController,
    AuthSessionsController,
    MePushTokenController,
  ],
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
        accessTokenTtlSeconds:
          config.get<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ??
          AUTH_CONFIG_DEFAULTS.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlSeconds:
          config.get<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') ??
          AUTH_CONFIG_DEFAULTS.AUTH_REFRESH_TOKEN_TTL_SECONDS,
        passwordMinLength:
          config.get<number>('AUTH_PASSWORD_MIN_LENGTH') ??
          AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_MIN_LENGTH,
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
  ],
})
export class AuthModule {}
