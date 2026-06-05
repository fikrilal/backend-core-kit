import { randomUUID } from 'crypto';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  type webcrypto,
} from 'crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';
import type { JwtAlg } from './auth.types';
import { asNonEmptyString, getNodeEnv, isObject, normalizeJwtAlg } from './auth.utils';

type JsonWebKey = webcrypto.JsonWebKey;
type JwksKey = JsonWebKey & { kid: string; use?: string; alg?: string };

type SigningKey = Readonly<{
  kid: string;
  alg: JwtAlg;
  privateKey: KeyObject;
}>;

function isJsonWebKey(value: unknown): value is JsonWebKey {
  return isObject(value) && typeof value.kty === 'string' && value.kty.trim() !== '';
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

function decodeBase64Utf8(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function exportPublicJwk(publicKey: KeyObject): JsonWebKey {
  const exported = publicKey.export({ format: 'jwk' });
  if (!isJsonWebKey(exported)) {
    throw new Error('Failed to export public JWK');
  }
  return exported;
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

    const algConfig = normalizeJwtAlg(this.config.get<string>('AUTH_JWT_ALG')) ?? 'EdDSA';
    const keysJsonRaw = asNonEmptyString(this.config.get<string>('AUTH_SIGNING_KEYS_JSON'));
    const keysJsonBase64 = asNonEmptyString(
      this.config.get<string>('AUTH_SIGNING_KEYS_JSON_BASE64'),
    );

    const keysJson = keysJsonRaw ?? (keysJsonBase64 ? decodeBase64Utf8(keysJsonBase64) : undefined);

    if (!keysJson) {
      if (productionLike) {
        throw new Error(
          'AUTH_SIGNING_KEYS_JSON (or AUTH_SIGNING_KEYS_JSON_BASE64) is required in staging/production',
        );
      }
      this.generateEphemeralKey(algConfig);
      return;
    }

    const items = parseSigningKeysJson(keysJson);
    const jwks: JwksKey[] = [];
    const publicKeys = new Map<string, Readonly<{ alg: JwtAlg; key: KeyObject }>>();
    let signingKey: SigningKey | undefined;

    for (const item of items) {
      if (!isObject(item) || !isJsonWebKey(item)) continue;

      const kid = asNonEmptyString(item.kid);
      if (!kid) continue;

      const alg = inferAlgFromJwk(item) ?? normalizeJwtAlg(item.alg) ?? algConfig;

      let publicKey: KeyObject;
      try {
        publicKey = createPublicKey({ key: item, format: 'jwk' });
      } catch {
        continue;
      }

      publicKeys.set(kid, { alg, key: publicKey });

      const publicJwk = exportPublicJwk(publicKey);
      jwks.push({ ...publicJwk, kid, use: 'sig', alg });

      if (!signingKey) {
        try {
          const privateKey = createPrivateKey({ key: item, format: 'jwk' });
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
    const publicJwk = exportPublicJwk(publicKey);

    this.signingKey = { kid, alg: resolvedAlg, privateKey };
    this.jwks = [{ ...publicJwk, kid, use: 'sig', alg: resolvedAlg }];
    this.publicKeys = new Map([[kid, { alg: resolvedAlg, key: publicKey }]]);
  }
}
