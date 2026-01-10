import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  type JsonWebKey,
  type KeyObject,
} from 'crypto';
import type { AccessTokenIssuer, SignAccessTokenInput } from '../../app/ports/access-token-issuer';
import { NodeEnv } from '../../../../platform/config/env.validation';

type JwtAlg = 'EdDSA' | 'RS256';

type JwksKey = JsonWebKey & { kid: string; use?: string; alg?: string };

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAlg(raw: unknown): JwtAlg | undefined {
  const v = asNonEmptyString(raw);
  if (!v) return undefined;

  const normalized = v.trim().toUpperCase();
  if (normalized === 'EDDSA') return 'EdDSA';
  if (normalized === 'RS256') return 'RS256';
  return undefined;
}

function inferAlgFromJwk(jwk: JsonWebKey): JwtAlg | undefined {
  if (jwk.kty === 'OKP') return 'EdDSA';
  if (jwk.kty === 'RSA') return 'RS256';
  return undefined;
}

function parseSigningKeyJson(raw: string): unknown[] {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && Array.isArray(parsed.keys)) return parsed.keys;
  throw new Error(
    'AUTH_SIGNING_KEYS_JSON must be a JSON array or a JWK set object with { keys: [...] }',
  );
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
  private jwks: JwksKey[] = [];

  constructor(private readonly config: ConfigService) {}

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
    return { keys: this.jwks };
  }

  private ensureInitialized(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    const nodeEnv =
      (this.config.get<string>('NODE_ENV') as NodeEnv | undefined) ?? NodeEnv.Development;
    const productionLike = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    const algConfig = normalizeAlg(this.config.get<string>('AUTH_JWT_ALG')) ?? 'EdDSA';
    const keysJson = asNonEmptyString(this.config.get<string>('AUTH_SIGNING_KEYS_JSON'));

    if (!keysJson) {
      if (productionLike) {
        throw new Error('AUTH_SIGNING_KEYS_JSON is required in staging/production');
      }
      this.generateEphemeralKey(algConfig);
      return;
    }

    const items = parseSigningKeyJson(keysJson);
    const jwks: JwksKey[] = [];
    let signingKey: SigningKey | undefined;

    for (const item of items) {
      if (!isObject(item)) continue;

      const kid = asNonEmptyString(item.kid);
      if (!kid) continue;

      const jwk = item as unknown as JsonWebKey;
      const alg = normalizeAlg(item.alg) ?? inferAlgFromJwk(jwk) ?? algConfig;

      let publicKey: KeyObject;
      try {
        publicKey = createPublicKey({ key: jwk, format: 'jwk' });
      } catch {
        continue;
      }

      const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      jwks.push({
        ...publicJwk,
        kid,
        use: 'sig',
        alg,
      });

      if (!signingKey) {
        try {
          const privateKey = createPrivateKey({ key: jwk, format: 'jwk' });
          signingKey = { kid, alg, privateKey };
        } catch {
          // public-only keys are still published via JWKS, but cannot be used to sign.
        }
      }
    }

    if (!signingKey) {
      if (productionLike) {
        throw new Error('AUTH_SIGNING_KEYS_JSON did not contain any usable private JWKs');
      }
      this.generateEphemeralKey(algConfig);
      return;
    }

    this.signingKey = signingKey;
    this.jwks = jwks;
  }

  private generateEphemeralKey(alg: JwtAlg): void {
    let resolvedAlg: JwtAlg = alg;
    let privateKey: KeyObject;
    let publicKey: KeyObject;

    try {
      if (alg === 'EdDSA') {
        ({ privateKey, publicKey } = generateKeyPairSync('ed25519'));
      } else {
        ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
      }
    } catch {
      resolvedAlg = 'RS256';
      ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    }

    const kid = randomUUID();
    const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;

    this.signingKey = { kid, alg: resolvedAlg, privateKey };
    this.jwks = [{ ...publicJwk, kid, use: 'sig', alg: resolvedAlg }];
  }
}
