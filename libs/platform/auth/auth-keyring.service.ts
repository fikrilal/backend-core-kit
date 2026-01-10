import { randomUUID } from 'crypto';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
} from 'crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';
import type { JwtAlg } from './auth.types';

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

function parseSigningKeysJson(raw: string): unknown[] {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && Array.isArray(parsed.keys)) return parsed.keys;
  throw new Error(
    'AUTH_SIGNING_KEYS_JSON must be a JSON array or a JWK set object with { keys: [...] }',
  );
}

function getNodeEnv(config: Pick<ConfigService, 'get'>): NodeEnv {
  const raw = config.get<string>('NODE_ENV');
  switch (raw) {
    case NodeEnv.Development:
    case NodeEnv.Test:
    case NodeEnv.Staging:
    case NodeEnv.Production:
      return raw;
    default:
      return NodeEnv.Development;
  }
}

@Injectable()
export class AuthKeyRing implements OnModuleInit {
  private initPromise?: Promise<void>;
  private signingKey?: SigningKey;
  private jwks: JwksKey[] = [];
  private publicKeys = new Map<string, Readonly<{ alg: JwtAlg; key: KeyObject }>>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async getSigningKey(): Promise<SigningKey> {
    await this.ensureInitialized();
    const key = this.signingKey;
    if (!key) throw new Error('No signing key available');
    return key;
  }

  async getPublicJwks(): Promise<Readonly<{ keys: ReadonlyArray<JwksKey> }>> {
    await this.ensureInitialized();
    return { keys: [...this.jwks] };
  }

  async getPublicKeyForKid(
    kid: string,
  ): Promise<Readonly<{ alg: JwtAlg; key: KeyObject }> | undefined> {
    await this.ensureInitialized();
    return this.publicKeys.get(kid);
  }

  private ensureInitialized(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    const nodeEnv = getNodeEnv(this.config);
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

    const items = parseSigningKeysJson(keysJson);
    const jwks: JwksKey[] = [];
    const publicKeys = new Map<string, Readonly<{ alg: JwtAlg; key: KeyObject }>>();
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

      publicKeys.set(kid, { alg, key: publicKey });

      const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      jwks.push({ ...publicJwk, kid, use: 'sig', alg });

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
    this.publicKeys = publicKeys;
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
    this.publicKeys = new Map([[kid, { alg: resolvedAlg, key: publicKey }]]);
  }
}
