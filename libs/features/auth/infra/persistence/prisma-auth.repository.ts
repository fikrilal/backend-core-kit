import { Injectable } from '@nestjs/common';
import type { ListQuery } from '../../../../shared/list-query';
import type { AuthMethod } from '../../../../shared/auth/auth-method';
import type { Email } from '../../domain/email';
import type { AuthUserRecord } from '../../app/auth.types';
import type { OidcProvider } from '../../app/ports/oidc-id-token-verifier';
import type {
  AuthRepository,
  ChangePasswordResult,
  CreateSessionInput,
  LinkExternalIdentityResult,
  ListUserSessionsResult,
  RefreshRotationResult,
  RefreshTokenRecord,
  RefreshTokenWithSession,
  ResetPasswordByTokenHashResult,
  SessionSeenMetadata,
  SessionPushPlatform,
  SessionRecord,
  UpsertSessionPushTokenResult,
  VerifyEmailResult,
  UserSessionsSortField,
} from '../../app/ports/auth.repository';
import { PrismaService } from '../../../../platform/db/prisma.service';
import {
  changePasswordAndRevokeOtherSessions as changePasswordAndRevokeOtherSessionsImpl,
  findPasswordCredential as findPasswordCredentialImpl,
  resetPasswordByTokenHash as resetPasswordByTokenHashImpl,
} from './prisma-auth.repository.credentials';
import {
  createRefreshToken as createRefreshTokenImpl,
  findRefreshTokenWithSession as findRefreshTokenWithSessionImpl,
  revokeSessionByRefreshTokenHash as revokeSessionByRefreshTokenHashImpl,
  rotateRefreshToken as rotateRefreshTokenImpl,
} from './prisma-auth.repository.refresh-tokens';
import {
  createSession as createSessionImpl,
  listUserSessions as listUserSessionsImpl,
  revokeActiveSessionForDevice as revokeActiveSessionForDeviceImpl,
  revokeSessionById as revokeSessionByIdImpl,
  revokeSessionPushToken as revokeSessionPushTokenImpl,
  upsertSessionPushToken as upsertSessionPushTokenImpl,
} from './prisma-auth.repository.sessions';
import {
  createUserWithExternalIdentity as createUserWithExternalIdentityImpl,
  createUserWithPassword as createUserWithPasswordImpl,
  findUserByExternalIdentity as findUserByExternalIdentityImpl,
  findUserById as findUserByIdImpl,
  findUserForLogin as findUserForLoginImpl,
  findUserIdByEmail as findUserIdByEmailImpl,
  getAuthMethods as getAuthMethodsImpl,
  linkExternalIdentityToUser as linkExternalIdentityToUserImpl,
  verifyEmailByTokenHash as verifyEmailByTokenHashImpl,
} from './prisma-auth.repository.users';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithPassword(email: Email, passwordHash: string): Promise<AuthUserRecord> {
    return await createUserWithPasswordImpl(this.prisma, email, passwordHash);
  }

  async findUserIdByEmail(email: Email): Promise<string | null> {
    return await findUserIdByEmailImpl(this.prisma, email);
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return await findUserByIdImpl(this.prisma, userId);
  }

  async getAuthMethods(userId: string): Promise<ReadonlyArray<AuthMethod>> {
    return await getAuthMethodsImpl(this.prisma, userId);
  }

  async findUserByExternalIdentity(
    provider: OidcProvider,
    subject: string,
  ): Promise<AuthUserRecord | null> {
    return await findUserByExternalIdentityImpl(this.prisma, provider, subject);
  }

  async createUserWithExternalIdentity(input: {
    email: Email;
    emailVerifiedAt: Date;
    profile?: Readonly<{ displayName?: string; givenName?: string; familyName?: string }>;
    externalIdentity: Readonly<{ provider: OidcProvider; subject: string; email?: string }>;
  }): Promise<AuthUserRecord> {
    return await createUserWithExternalIdentityImpl(this.prisma, input);
  }

  async linkExternalIdentityToUser(input: {
    userId: string;
    provider: OidcProvider;
    subject: string;
    email?: Email;
    now: Date;
  }): Promise<LinkExternalIdentityResult> {
    return await linkExternalIdentityToUserImpl(this.prisma, input);
  }

  async listUserSessions(
    userId: string,
    query: ListQuery<UserSessionsSortField, never>,
  ): Promise<ListUserSessionsResult> {
    return await listUserSessionsImpl(this.prisma, userId, query);
  }

  async revokeSessionById(userId: string, sessionId: string, now: Date): Promise<boolean> {
    return await revokeSessionByIdImpl(this.prisma, userId, sessionId, now);
  }

  async upsertSessionPushToken(input: {
    userId: string;
    sessionId: string;
    platform: SessionPushPlatform;
    token: string;
    now: Date;
  }): Promise<UpsertSessionPushTokenResult> {
    return await upsertSessionPushTokenImpl(this.prisma, input);
  }

  async revokeSessionPushToken(input: {
    userId: string;
    sessionId: string;
    now: Date;
  }): Promise<void> {
    await revokeSessionPushTokenImpl(this.prisma, input);
  }

  async findUserForLogin(
    email: Email,
  ): Promise<{ user: AuthUserRecord; passwordHash: string } | null> {
    return await findUserForLoginImpl(this.prisma, email);
  }

  async verifyEmailByTokenHash(tokenHash: string, now: Date): Promise<VerifyEmailResult> {
    return await verifyEmailByTokenHashImpl(this.prisma, tokenHash, now);
  }

  async findPasswordCredential(userId: string): Promise<Readonly<{ passwordHash: string }> | null> {
    return await findPasswordCredentialImpl(this.prisma, userId);
  }

  async resetPasswordByTokenHash(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<ResetPasswordByTokenHashResult> {
    return await resetPasswordByTokenHashImpl(this.prisma, tokenHash, newPasswordHash, now);
  }

  async changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    sessionId: string;
    expectedCurrentPasswordHash: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<ChangePasswordResult> {
    return await changePasswordAndRevokeOtherSessionsImpl(this.prisma, input);
  }

  async findRefreshTokenWithSession(tokenHash: string): Promise<RefreshTokenWithSession | null> {
    return await findRefreshTokenWithSessionImpl(this.prisma, tokenHash);
  }

  async revokeActiveSessionForDevice(userId: string, activeKey: string, now: Date): Promise<void> {
    await revokeActiveSessionForDeviceImpl(this.prisma, userId, activeKey, now);
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return await createSessionImpl(this.prisma, input);
  }

  async createRefreshToken(
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshTokenRecord> {
    return await createRefreshTokenImpl(this.prisma, sessionId, tokenHash, expiresAt);
  }

  async rotateRefreshToken(
    tokenHash: string,
    newTokenHash: string,
    now: Date,
    session?: SessionSeenMetadata,
  ): Promise<RefreshRotationResult> {
    return await rotateRefreshTokenImpl(this.prisma, tokenHash, newTokenHash, now, session);
  }

  async revokeSessionByRefreshTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    return await revokeSessionByRefreshTokenHashImpl(this.prisma, tokenHash, now);
  }
}
