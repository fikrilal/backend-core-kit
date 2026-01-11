import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type {
  OidcIdTokenVerifier,
  OidcProvider,
  VerifyOidcIdTokenResult,
} from '../../app/ports/oidc-id-token-verifier';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function parseClientIds(raw: string | undefined): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseEmailVerified(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
}

@Injectable()
export class GoogleOidcIdTokenVerifier implements OidcIdTokenVerifier {
  private readonly clientIds: string[];

  constructor(private readonly config: ConfigService) {
    this.clientIds = parseClientIds(this.config.get<string>('AUTH_OIDC_GOOGLE_CLIENT_IDS'));
  }

  async verifyIdToken(input: {
    provider: OidcProvider;
    idToken: string;
  }): Promise<VerifyOidcIdTokenResult> {
    if (input.provider !== 'GOOGLE') return { kind: 'invalid' };

    if (this.clientIds.length === 0) return { kind: 'not_configured' };

    try {
      const { payload } = await jwtVerify(input.idToken, GOOGLE_JWKS, {
        issuer: [...GOOGLE_ISSUERS],
        audience: this.clientIds,
      });

      const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const emailVerified = parseEmailVerified(payload.email_verified);

      if (!subject || !email || emailVerified === undefined) return { kind: 'invalid' };

      const displayName = typeof payload.name === 'string' ? payload.name : undefined;
      const givenName = typeof payload.given_name === 'string' ? payload.given_name : undefined;
      const familyName = typeof payload.family_name === 'string' ? payload.family_name : undefined;

      return {
        kind: 'verified',
        identity: {
          provider: input.provider,
          subject,
          email,
          emailVerified,
          ...(displayName ? { displayName } : {}),
          ...(givenName ? { givenName } : {}),
          ...(familyName ? { familyName } : {}),
        },
      };
    } catch {
      return { kind: 'invalid' };
    }
  }
}
