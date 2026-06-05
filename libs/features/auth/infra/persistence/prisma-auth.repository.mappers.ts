import {
  ExternalIdentityProvider as PrismaExternalIdentityProvider,
  PushPlatform as PrismaPushPlatform,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
  type RefreshToken,
  type User,
} from '@prisma/client';
import type { AuthRole, AuthUserRecord, AuthUserStatus } from '../../app/auth.types';
import type { OidcProvider } from '../../app/ports/oidc-id-token-verifier';
import type { RefreshTokenRecord, SessionPushPlatform } from '../../app/ports/auth.repository';

function toAuthRole(role: PrismaUserRole): AuthRole {
  switch (role) {
    case PrismaUserRole.USER:
      return 'USER';
    case PrismaUserRole.ADMIN:
      return 'ADMIN';
  }
}

function toAuthUserStatus(status: PrismaUserStatus): AuthUserStatus {
  switch (status) {
    case PrismaUserStatus.ACTIVE:
      return 'ACTIVE';
    case PrismaUserStatus.SUSPENDED:
      return 'SUSPENDED';
    case PrismaUserStatus.DELETED:
      return 'DELETED';
  }
}

export function toAuthUserRecord(
  user: Pick<User, 'id' | 'email' | 'emailVerifiedAt' | 'role' | 'status'>,
): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: toAuthRole(user.role),
    status: toAuthUserStatus(user.status),
  };
}

export function toPrismaExternalIdentityProvider(
  provider: OidcProvider,
): PrismaExternalIdentityProvider {
  switch (provider) {
    case 'GOOGLE':
      return PrismaExternalIdentityProvider.GOOGLE;
  }
}

export function toPrismaPushPlatform(platform: SessionPushPlatform): PrismaPushPlatform {
  switch (platform) {
    case 'ANDROID':
      return PrismaPushPlatform.ANDROID;
    case 'IOS':
      return PrismaPushPlatform.IOS;
    case 'WEB':
      return PrismaPushPlatform.WEB;
  }
}

export function toRefreshTokenRecord(
  token: Pick<
    RefreshToken,
    'id' | 'tokenHash' | 'expiresAt' | 'revokedAt' | 'sessionId' | 'replacedById'
  >,
): RefreshTokenRecord {
  return {
    id: token.id,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    sessionId: token.sessionId,
    replacedById: token.replacedById,
  };
}
