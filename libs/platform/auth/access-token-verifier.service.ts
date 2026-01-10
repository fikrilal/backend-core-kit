import { verify as cryptoVerify } from 'crypto';
import type { KeyObject } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';
import type { AuthPrincipal, JwtAlg } from './auth.types';
import { AuthKeyRing } from './auth-keyring.service';

export class AccessTokenInvalidError extends Error {
  constructor() {
    super('Invalid access token');
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function decodeBase64UrlJson(segment: string): unknown {
  let json: string;
  try {
    json = Buffer.from(segment, 'base64url').toString('utf8');
  } catch {
    throw new AccessTokenInvalidError();
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new AccessTokenInvalidError();
  }
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessTokenInvalidError();

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new AccessTokenInvalidError();

  const headerRaw = decodeBase64UrlJson(encodedHeader);
  const payloadRaw = decodeBase64UrlJson(encodedPayload);

  if (!isObject(headerRaw) || !isObject(payloadRaw)) throw new AccessTokenInvalidError();

  let signature: Buffer;
  try {
    signature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new AccessTokenInvalidError();
  }

  return {
    header: headerRaw,
    payload: payloadRaw,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature,
  };
}

function normalizeAlg(value: unknown): JwtAlg | undefined {
  const v = asNonEmptyString(value);
  if (!v) return undefined;
  const normalized = v.trim().toUpperCase();
  if (normalized === 'EDDSA') return 'EdDSA';
  if (normalized === 'RS256') return 'RS256';
  return undefined;
}

function verifySignature(
  alg: JwtAlg,
  key: KeyObject,
  signingInput: string,
  signature: Buffer,
): boolean {
  const data = Buffer.from(signingInput, 'utf8');
  if (alg === 'RS256') {
    return cryptoVerify('RSA-SHA256', data, key, signature);
  }

  return cryptoVerify(null, data, key, signature);
}

function audMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  if (Array.isArray(aud)) return aud.some((v) => typeof v === 'string' && v === expected);
  return false;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

@Injectable()
export class AccessTokenVerifier {
  constructor(
    private readonly config: ConfigService,
    private readonly keys: AuthKeyRing,
  ) {}

  async verifyAccessToken(token: string): Promise<AuthPrincipal> {
    const nodeEnv = getNodeEnv(this.config);
    const productionLike = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    const issuer = asNonEmptyString(this.config.get<string>('AUTH_ISSUER'));
    const audience = asNonEmptyString(this.config.get<string>('AUTH_AUDIENCE'));
    if (productionLike && (!issuer || !audience)) {
      throw new Error('AUTH_ISSUER and AUTH_AUDIENCE are required in staging/production');
    }

    const { header, payload, signingInput, signature } = parseJwt(token);

    const kid = asNonEmptyString(header.kid);
    const alg = normalizeAlg(header.alg);
    if (!kid || !alg) throw new AccessTokenInvalidError();

    const key = await this.keys.getPublicKeyForKid(kid);
    if (!key) throw new AccessTokenInvalidError();
    if (key.alg !== alg) throw new AccessTokenInvalidError();

    const ok = verifySignature(alg, key.key, signingInput, signature);
    if (!ok) throw new AccessTokenInvalidError();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = asNumber(payload.exp);
    if (exp === undefined || exp <= nowSeconds) throw new AccessTokenInvalidError();

    if (issuer && payload.iss !== issuer) throw new AccessTokenInvalidError();
    if (audience && !audMatches(payload.aud, audience)) throw new AccessTokenInvalidError();

    if (payload.typ !== 'access') throw new AccessTokenInvalidError();

    const userId = asNonEmptyString(payload.sub);
    const sessionId = asNonEmptyString(payload.sid);
    if (!userId || !sessionId) throw new AccessTokenInvalidError();

    const emailVerified = payload.email_verified === true;

    return { userId, sessionId, emailVerified };
  }
}
