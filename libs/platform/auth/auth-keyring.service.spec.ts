import { generateKeyPairSync, type JsonWebKey } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { AuthKeyRing } from './auth-keyring.service';

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

describe('AuthKeyRing', () => {
  it('infers EdDSA from OKP even when item.alg is RS256', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const kid = 'kid-eddsa';
    const jwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;

    const keyring = new AuthKeyRing(
      stubConfig({
        NODE_ENV: 'test',
        AUTH_JWT_ALG: 'RS256',
        AUTH_SIGNING_KEYS_JSON: JSON.stringify([{ ...jwk, kid, alg: 'RS256' }]),
      }),
    );

    const signingKey = await keyring.getSigningKey();
    expect(signingKey.kid).toBe(kid);
    expect(signingKey.alg).toBe('EdDSA');

    const publicKey = await keyring.getPublicKeyForKid(kid);
    expect(publicKey?.alg).toBe('EdDSA');

    const jwks = await keyring.getPublicJwks();
    expect(jwks.keys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kid, alg: 'EdDSA' })]),
    );
  });

  it('infers RS256 from RSA even when item.alg is EdDSA', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-rs256';
    const jwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;

    const keyring = new AuthKeyRing(
      stubConfig({
        NODE_ENV: 'test',
        AUTH_JWT_ALG: 'EdDSA',
        AUTH_SIGNING_KEYS_JSON: JSON.stringify([{ ...jwk, kid, alg: 'EdDSA' }]),
      }),
    );

    const signingKey = await keyring.getSigningKey();
    expect(signingKey.kid).toBe(kid);
    expect(signingKey.alg).toBe('RS256');

    const publicKey = await keyring.getPublicKeyForKid(kid);
    expect(publicKey?.alg).toBe('RS256');

    const jwks = await keyring.getPublicJwks();
    expect(jwks.keys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kid, alg: 'RS256' })]),
    );
  });
});
