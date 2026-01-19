import { verify as cryptoVerify } from 'crypto';
import type { KeyObject } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/env.validation';
import type { AuthPrincipal, JwtAlg } from './auth.types';
import { AuthKeyRing } from './auth-keyring.service';
import { asNonEmptyString, getNodeEnv, isObject, normalizeJwtAlg } from './auth.utils';

export class AccessTokenInvalidError extends Error {
  constructor() {
    super('Invalid access token');
  }
}

const MAX_ACCESS_TOKEN_LENGTH = 16_384;
const JWT_CLOCK_SKEW_SECONDS = 60;
const MAX_JTI_LENGTH = 128;

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

function parseRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const role = item.trim();
    if (!role) continue;
    if (seen.has(role)) continue;
    seen.add(role);
    out.push(role);
  }

  return out;
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

    if (token.length > MAX_ACCESS_TOKEN_LENGTH) throw new AccessTokenInvalidError();

    const { header, payload, signingInput, signature } = parseJwt(token);

    const kid = asNonEmptyString(header.kid);
    const alg = normalizeJwtAlg(header.alg);
    if (!kid || !alg) throw new AccessTokenInvalidError();

    const key = await this.keys.getPublicKeyForKid(kid);
    if (!key) throw new AccessTokenInvalidError();
    if (key.alg !== alg) throw new AccessTokenInvalidError();

    const ok = verifySignature(alg, key.key, signingInput, signature);
    if (!ok) throw new AccessTokenInvalidError();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const iat = asNumber(payload.iat);
    const exp = asNumber(payload.exp);
    if (exp === undefined || exp <= nowSeconds) throw new AccessTokenInvalidError();
    if (iat === undefined || iat > nowSeconds + JWT_CLOCK_SKEW_SECONDS)
      throw new AccessTokenInvalidError();
    if (iat > exp) throw new AccessTokenInvalidError();

    const nbf = asNumber(payload.nbf);
    if (nbf !== undefined) {
      if (nbf > nowSeconds + JWT_CLOCK_SKEW_SECONDS) throw new AccessTokenInvalidError();
      if (nbf > exp) throw new AccessTokenInvalidError();
    }

    if (issuer && payload.iss !== issuer) throw new AccessTokenInvalidError();
    if (audience && !audMatches(payload.aud, audience)) throw new AccessTokenInvalidError();

    if (payload.typ !== 'access') throw new AccessTokenInvalidError();

    const userId = asNonEmptyString(payload.sub);
    const sessionId = asNonEmptyString(payload.sid);
    const jti = asNonEmptyString(payload.jti);
    if (!userId || !sessionId || !jti) throw new AccessTokenInvalidError();
    if (jti.length > MAX_JTI_LENGTH) throw new AccessTokenInvalidError();

    const emailVerified = payload.email_verified === true;
    const roles = parseRoles(payload.roles);

    return { userId, sessionId, emailVerified, roles };
  }
}
