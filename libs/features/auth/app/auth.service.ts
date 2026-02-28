import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type { AuthRepository } from './ports/auth.repository';
import type { LoginRateLimiter } from './ports/login-rate-limiter';
import type { OidcIdTokenVerifier, OidcProvider } from './ports/oidc-id-token-verifier';
import type { PasswordHasher } from './ports/password-hasher';
import type { Clock } from './time';
import type { AuthResult } from './auth.types';
import type { AuthConfig } from './auth.config';
import { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import { AuthPasswordAuthService } from './auth-password-auth.service';
import { AuthOidcAuthService } from './auth-oidc-auth.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthPasswordResetService } from './auth-password-reset.service';

export class AuthService {
  private readonly sessionLifecycle: AuthSessionLifecycleService;
  private readonly passwordAuth: AuthPasswordAuthService;
  private readonly oidcAuth: AuthOidcAuthService;
  private readonly emailVerification: AuthEmailVerificationService;
  private readonly passwordReset: AuthPasswordResetService;

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly oidcVerifier: OidcIdTokenVerifier,
    private readonly loginRateLimiter: LoginRateLimiter,
    private readonly clock: Clock,
    private readonly dummyPasswordHash: string,
    private readonly config: AuthConfig,
  ) {
    this.sessionLifecycle = new AuthSessionLifecycleService(
      this.repo,
      this.accessTokens,
      this.clock,
      this.config,
    );
    this.passwordAuth = new AuthPasswordAuthService(
      this.repo,
      this.passwordHasher,
      this.loginRateLimiter,
      this.clock,
      this.dummyPasswordHash,
      this.config,
      this.sessionLifecycle,
    );
    this.oidcAuth = new AuthOidcAuthService(
      this.repo,
      this.oidcVerifier,
      this.clock,
      this.sessionLifecycle,
    );
    this.emailVerification = new AuthEmailVerificationService(this.repo, this.clock);
    this.passwordReset = new AuthPasswordResetService(
      this.repo,
      this.passwordHasher,
      this.clock,
      this.config,
    );
  }

  async registerWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    return await this.passwordAuth.registerWithPassword(input);
  }

  async loginWithPassword(input: {
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    return await this.passwordAuth.loginWithPassword(input);
  }

  async exchangeOidc(input: {
    provider: OidcProvider;
    idToken: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    return await this.oidcAuth.exchangeOidc(input);
  }

  async connectOidc(input: {
    userId: string;
    provider: OidcProvider;
    idToken: string;
  }): Promise<void> {
    await this.oidcAuth.connectOidc(input);
  }

  async changePassword(input: {
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    await this.passwordAuth.changePassword(input);
  }

  async refresh(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    return await this.sessionLifecycle.refresh(input);
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    await this.sessionLifecycle.logout(input);
  }

  async verifyEmail(input: { token: string }): Promise<void> {
    await this.emailVerification.verifyEmail(input);
  }

  async getEmailVerificationStatus(userId: string): Promise<'verified' | 'unverified'> {
    return await this.emailVerification.getEmailVerificationStatus(userId);
  }

  async requestPasswordReset(input: {
    email: string;
  }): Promise<Readonly<{ userId: string }> | null> {
    return await this.passwordReset.requestPasswordReset(input);
  }

  async confirmPasswordReset(input: { token: string; newPassword: string }): Promise<void> {
    await this.passwordReset.confirmPasswordReset(input);
  }

  async getPublicJwks(): Promise<unknown> {
    return this.sessionLifecycle.getPublicJwks();
  }
}
