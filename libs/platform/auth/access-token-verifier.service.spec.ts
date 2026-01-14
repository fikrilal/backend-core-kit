import { generateKeyPairSync, sign } from 'crypto';
import type { KeyObject } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { AuthKeyRing } from './auth-keyring.service';
import { AccessTokenInvalidError, AccessTokenVerifier } from './access-token-verifier.service';
import type { JwtAlg } from './auth.types';

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signJwt(alg: JwtAlg, signingInput: string, privateKey: KeyObject): string {
  const data = Buffer.from(signingInput, 'utf8');
  const signature =
    alg === 'RS256' ? sign('RSA-SHA256', data, privateKey) : sign(null, data, privateKey);
  return signature.toString('base64url');
}

function createSignedJwt(params: {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  alg: JwtAlg;
  privateKey: KeyObject;
}): string {
  const encodedHeader = base64UrlJson(params.header);
  const encodedPayload = base64UrlJson(params.payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwt(params.alg, signingInput, params.privateKey);
  return `${signingInput}.${signature}`;
}

describe('AccessTokenVerifier', () => {
  it('verifies a valid RS256 token and returns principal', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-1';

    const verifier = new AccessTokenVerifier(
      stubConfig({ AUTH_ISSUER: 'https://issuer.example', AUTH_AUDIENCE: 'api', NODE_ENV: 'test' }),
      {
        getPublicKeyForKid: async (requestedKid: string) =>
          requestedKid === kid ? { alg: 'RS256', key: publicKey } : undefined,
      } as unknown as AuthKeyRing,
    );

    const token = createSignedJwt({
      alg: 'RS256',
      privateKey,
      header: { kid, alg: 'RS256' },
      payload: {
        typ: 'access',
        sub: 'user-1',
        sid: 'session-1',
        iss: 'https://issuer.example',
        aud: ['api'],
        exp: Math.floor(Date.now() / 1000) + 60,
        email_verified: true,
        roles: ['USER', 'USER', '  ADMIN  '],
      },
    });

    await expect(verifier.verifyAccessToken(token)).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: true,
      roles: ['USER', 'ADMIN'],
    });
  });

  it('throws when AUTH_ISSUER/AUTH_AUDIENCE are missing in staging', async () => {
    const verifier = new AccessTokenVerifier(stubConfig({ NODE_ENV: 'staging' }), {
      getPublicKeyForKid: async () => undefined,
    } as unknown as AuthKeyRing);

    await expect(verifier.verifyAccessToken('x.y.z')).rejects.toThrow(
      /AUTH_ISSUER and AUTH_AUDIENCE are required/i,
    );
  });

  it('rejects expired tokens', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-exp';

    const verifier = new AccessTokenVerifier(stubConfig({ NODE_ENV: 'test' }), {
      getPublicKeyForKid: async (requestedKid: string) =>
        requestedKid === kid ? { alg: 'RS256', key: publicKey } : undefined,
    } as unknown as AuthKeyRing);

    const token = createSignedJwt({
      alg: 'RS256',
      privateKey,
      header: { kid, alg: 'RS256' },
      payload: {
        typ: 'access',
        sub: 'user-1',
        sid: 'session-1',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });

  it('enforces issuer and audience when configured', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-issuer-aud';

    const verifier = new AccessTokenVerifier(
      stubConfig({
        NODE_ENV: 'test',
        AUTH_ISSUER: 'https://issuer.example',
        AUTH_AUDIENCE: 'api',
      }),
      {
        getPublicKeyForKid: async (requestedKid: string) =>
          requestedKid === kid ? { alg: 'RS256', key: publicKey } : undefined,
      } as unknown as AuthKeyRing,
    );

    const token = createSignedJwt({
      alg: 'RS256',
      privateKey,
      header: { kid, alg: 'RS256' },
      payload: {
        typ: 'access',
        sub: 'user-1',
        sid: 'session-1',
        iss: 'https://issuer.example',
        aud: ['not-api'],
        exp: Math.floor(Date.now() / 1000) + 60,
      },
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });

  it('rejects tokens with unknown kid', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

    const verifier = new AccessTokenVerifier(stubConfig({ NODE_ENV: 'test' }), {
      getPublicKeyForKid: async () => undefined,
    } as unknown as AuthKeyRing);

    const token = createSignedJwt({
      alg: 'RS256',
      privateKey,
      header: { kid: 'unknown', alg: 'RS256' },
      payload: {
        typ: 'access',
        sub: 'user-1',
        sid: 'session-1',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });

  it('rejects tokens with non-access typ', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-typ';

    const verifier = new AccessTokenVerifier(stubConfig({ NODE_ENV: 'test' }), {
      getPublicKeyForKid: async (requestedKid: string) =>
        requestedKid === kid ? { alg: 'RS256', key: publicKey } : undefined,
    } as unknown as AuthKeyRing);

    const token = createSignedJwt({
      alg: 'RS256',
      privateKey,
      header: { kid, alg: 'RS256' },
      payload: {
        typ: 'refresh',
        sub: 'user-1',
        sid: 'session-1',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });
});
