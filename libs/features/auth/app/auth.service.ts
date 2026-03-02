import type { OidcProvider } from './ports/oidc-id-token-verifier';
import type { AuthResult } from './auth.types';
import type { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import type { AuthPasswordAuthService } from './auth-password-auth.service';
import type { AuthOidcAuthService } from './auth-oidc-auth.service';
import type { AuthEmailVerificationService } from './auth-email-verification.service';
import type { AuthPasswordResetService } from './auth-password-reset.service';

export class AuthService {
  constructor(
    private readonly sessionLifecycle: AuthSessionLifecycleService,
    private readonly passwordAuth: AuthPasswordAuthService,
    private readonly oidcAuth: AuthOidcAuthService,
    private readonly emailVerification: AuthEmailVerificationService,
    private readonly passwordReset: AuthPasswordResetService,
  ) {}

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
