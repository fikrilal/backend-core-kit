import {
  ExternalIdentityProvider as PrismaExternalIdentityProvider,
  type Prisma,
} from '@prisma/client';
import type { AuthMethod } from '../../../../shared/auth/auth-method';
import type { Email } from '../../domain/email';
import type { AuthUserRecord } from '../../app/auth.types';
import type { OidcProvider } from '../../app/ports/oidc-id-token-verifier';
import type {
  LinkExternalIdentityResult,
  VerifyEmailResult,
} from '../../app/ports/auth.repository';
import { EmailAlreadyExistsError, ExternalIdentityAlreadyExistsError } from '../../app/auth.errors';
import type { PrismaService } from '../../../../platform/db/prisma.service';
import {
  isUniqueConstraintError,
  isUniqueConstraintErrorOnFields,
} from './prisma-auth.repository.prisma-errors';
import {
  toAuthUserRecord,
  toPrismaExternalIdentityProvider,
} from './prisma-auth.repository.mappers';
import { withSerializableRetry } from './prisma-auth.repository.tx';

async function verifyEmailIfMatching(input: {
  tx: Prisma.TransactionClient;
  user: Readonly<{ id: string; email: string; emailVerifiedAt: Date | null }>;
  email?: string;
  now: Date;
}): Promise<void> {
  if (!input.email) return;
  if (input.user.emailVerifiedAt !== null) return;
  if (input.email !== input.user.email) return;

  await input.tx.user.updateMany({
    where: { id: input.user.id, emailVerifiedAt: null },
    data: { emailVerifiedAt: input.now },
  });
}

export async function createUserWithPassword(
  prisma: PrismaService,
  email: Email,
  passwordHash: string,
): Promise<AuthUserRecord> {
  try {
    const user = await prisma.transaction(async (tx) =>
      tx.user.create({
        data: {
          email,
          passwordCredential: { create: { passwordHash } },
          profile: { create: {} },
        },
        select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true },
      }),
    );
    return toAuthUserRecord(user);
  } catch (err: unknown) {
    if (isUniqueConstraintError(err, 'email')) {
      throw new EmailAlreadyExistsError();
    }
    throw err;
  }
}

export async function findUserIdByEmail(
  prisma: PrismaService,
  email: Email,
): Promise<string | null> {
  const client = prisma.getClient();
  const user = await client.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function findUserById(
  prisma: PrismaService,
  userId: string,
): Promise<AuthUserRecord | null> {
  const client = prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true },
  });
  return user ? toAuthUserRecord(user) : null;
}

export async function getAuthMethods(
  prisma: PrismaService,
  userId: string,
): Promise<ReadonlyArray<AuthMethod>> {
  const client = prisma.getClient();
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      passwordCredential: { select: { userId: true } },
      externalIdentities: { select: { provider: true } },
    },
  });
  if (!user) throw new Error('User not found');

  const methods: AuthMethod[] = [];

  if (user.passwordCredential) methods.push('PASSWORD');

  const hasGoogle = user.externalIdentities.some(
    (i) => i.provider === PrismaExternalIdentityProvider.GOOGLE,
  );
  if (hasGoogle) methods.push('GOOGLE');

  return methods;
}

export async function findUserByExternalIdentity(
  prisma: PrismaService,
  provider: OidcProvider,
  subject: string,
): Promise<AuthUserRecord | null> {
  const client = prisma.getClient();
  const found = await client.externalIdentity.findFirst({
    where: { provider: toPrismaExternalIdentityProvider(provider), subject },
    select: {
      user: { select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true } },
    },
  });
  return found ? toAuthUserRecord(found.user) : null;
}

export async function createUserWithExternalIdentity(
  prisma: PrismaService,
  input: {
    email: Email;
    emailVerifiedAt: Date;
    profile?: Readonly<{ displayName?: string; givenName?: string; familyName?: string }>;
    externalIdentity: Readonly<{ provider: OidcProvider; subject: string; email?: string }>;
  },
): Promise<AuthUserRecord> {
  try {
    const user = await prisma.transaction(async (tx) =>
      tx.user.create({
        data: {
          email: input.email,
          emailVerifiedAt: input.emailVerifiedAt,
          profile: {
            create: {
              ...(input.profile?.displayName ? { displayName: input.profile.displayName } : {}),
              ...(input.profile?.givenName ? { givenName: input.profile.givenName } : {}),
              ...(input.profile?.familyName ? { familyName: input.profile.familyName } : {}),
            },
          },
          externalIdentities: {
            create: {
              provider: toPrismaExternalIdentityProvider(input.externalIdentity.provider),
              subject: input.externalIdentity.subject,
              ...(input.externalIdentity.email ? { email: input.externalIdentity.email } : {}),
            },
          },
        },
        select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true },
      }),
    );
    return toAuthUserRecord(user);
  } catch (err: unknown) {
    if (isUniqueConstraintError(err, 'email')) {
      throw new EmailAlreadyExistsError();
    }
    if (isUniqueConstraintErrorOnFields(err, ['provider', 'subject'])) {
      throw new ExternalIdentityAlreadyExistsError();
    }
    throw err;
  }
}

export async function linkExternalIdentityToUser(
  prisma: PrismaService,
  input: {
    userId: string;
    provider: OidcProvider;
    subject: string;
    email?: Email;
    now: Date;
  },
): Promise<LinkExternalIdentityResult> {
  const provider = toPrismaExternalIdentityProvider(input.provider);

  return await prisma.transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) return { kind: 'user_not_found' };

    const identity = await tx.externalIdentity.findFirst({
      where: { provider, subject: input.subject },
      select: { userId: true },
    });

    if (identity) {
      if (identity.userId !== input.userId) return { kind: 'identity_linked_to_other_user' };

      await verifyEmailIfMatching({ tx, user, email: input.email, now: input.now });

      return { kind: 'already_linked' };
    }

    const existingProvider = await tx.externalIdentity.findFirst({
      where: { userId: input.userId, provider },
      select: { id: true },
    });
    if (existingProvider) return { kind: 'provider_already_linked' };

    try {
      await tx.externalIdentity.create({
        data: {
          provider,
          subject: input.subject,
          ...(input.email ? { email: input.email } : {}),
          userId: input.userId,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      if (!isUniqueConstraintError(err)) throw err;

      const racedIdentity = await tx.externalIdentity.findFirst({
        where: { provider, subject: input.subject },
        select: { userId: true },
      });
      if (racedIdentity) {
        if (racedIdentity.userId !== input.userId) {
          return { kind: 'identity_linked_to_other_user' };
        }

        await verifyEmailIfMatching({ tx, user, email: input.email, now: input.now });

        return { kind: 'already_linked' };
      }

      const racedProvider = await tx.externalIdentity.findFirst({
        where: { userId: input.userId, provider },
        select: { id: true },
      });
      if (racedProvider) return { kind: 'provider_already_linked' };

      throw err;
    }

    await verifyEmailIfMatching({ tx, user, email: input.email, now: input.now });

    return { kind: 'ok' };
  });
}

export async function findUserForLogin(
  prisma: PrismaService,
  email: Email,
): Promise<{ user: AuthUserRecord; passwordHash: string } | null> {
  const client = prisma.getClient();
  const user = await client.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      role: true,
      status: true,
      passwordCredential: { select: { passwordHash: true } },
    },
  });

  if (!user || !user.passwordCredential) return null;
  return {
    user: toAuthUserRecord(user),
    passwordHash: user.passwordCredential.passwordHash,
  };
}

export async function verifyEmailByTokenHash(
  prisma: PrismaService,
  tokenHash: string,
  now: Date,
): Promise<VerifyEmailResult> {
  const client = prisma.getClient();

  return await withSerializableRetry(client, async (tx) => {
    const token = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: { select: { emailVerifiedAt: true } },
      },
    });

    if (!token) return { kind: 'token_invalid' };

    if (token.user.emailVerifiedAt !== null) {
      await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      return { kind: 'already_verified' };
    }

    if (token.revokedAt !== null || token.usedAt !== null) {
      return { kind: 'token_invalid' };
    }

    if (token.expiresAt.getTime() <= now.getTime()) {
      return { kind: 'token_expired' };
    }

    const userUpdated = await tx.user.updateMany({
      where: { id: token.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });

    await tx.emailVerificationToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });

    if (userUpdated.count === 0) return { kind: 'already_verified' };
    return { kind: 'ok' };
  });
}
