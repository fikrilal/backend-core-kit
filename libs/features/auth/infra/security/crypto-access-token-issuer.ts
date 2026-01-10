import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, sign as cryptoSign, type KeyObject } from 'crypto';
import type { AccessTokenIssuer, SignAccessTokenInput } from '../../app/ports/access-token-issuer';
import { AuthKeyRing } from '../../../../platform/auth/auth-keyring.service';
import type { JwtAlg } from '../../../../platform/auth/auth.types';

type SigningKey = Readonly<{
  kid: string;
  alg: JwtAlg;
  privateKey: KeyObject;
}>;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signJwt(signingInput: string, key: KeyObject, alg: JwtAlg): string {
  const data = Buffer.from(signingInput, 'utf8');
  const signature =
    alg === 'RS256' ? cryptoSign('RSA-SHA256', data, key) : cryptoSign(null, data, key);
  return signature.toString('base64url');
}

@Injectable()
export class CryptoAccessTokenIssuer implements AccessTokenIssuer, OnModuleInit {
  private initPromise?: Promise<void>;
  private signingKey?: SigningKey;

  constructor(
    private readonly config: ConfigService,
    private readonly keys: AuthKeyRing,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async signAccessToken(input: SignAccessTokenInput): Promise<string> {
    await this.ensureInitialized();
    const key = this.signingKey;
    if (!key) {
      throw new Error('No signing key available');
    }

    const issuer = asNonEmptyString(this.config.get<string>('AUTH_ISSUER'));
    const audience = asNonEmptyString(this.config.get<string>('AUTH_AUDIENCE'));
    const nowSeconds = Math.floor(Date.now() / 1000);

    const header: Record<string, unknown> = {
      alg: key.alg,
      kid: key.kid,
      typ: 'JWT',
    };

    const payload: Record<string, unknown> = {
      sub: input.userId,
      sid: input.sessionId,
      email_verified: input.emailVerified,
      typ: 'access',
      iat: nowSeconds,
      exp: nowSeconds + input.ttlSeconds,
      jti: randomUUID(),
      ...(issuer ? { iss: issuer } : {}),
      ...(audience ? { aud: audience } : {}),
    };

    const encodedHeader = encodeSegment(header);
    const encodedPayload = encodeSegment(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = signJwt(signingInput, key.privateKey, key.alg);
    return `${signingInput}.${signature}`;
  }

  async getPublicJwks(): Promise<unknown> {
    await this.ensureInitialized();
    return this.keys.getPublicJwks();
  }

  private ensureInitialized(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    const key = await this.keys.getSigningKey();
    this.signingKey = { kid: key.kid, alg: key.alg, privateKey: key.privateKey };
  }
}
