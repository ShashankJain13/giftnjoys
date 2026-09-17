import { unauthorized, type MetaRepository } from '@gnj/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from './env';

export interface AdminPrincipal {
  sub: string;
  email: string;
  name?: string;
}

export interface Authenticator {
  mode: 'local' | 'cognito';
  verify(token: string): Promise<AdminPrincipal>;
}

const ISSUER = 'gnj-admin-api-local';
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const AUDIENCE = 'gnj-admin';

export class LocalAuthenticator implements Authenticator {
  readonly mode = 'local' as const;
  private readonly key: Uint8Array;
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    secret: string,
    private readonly meta: MetaRepository,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async login(email: string, password: string): Promise<{ token: string; admin: AdminPrincipal }> {
    const normalized = email.trim().toLowerCase();
    const lock = this.failures.get(normalized);
    if (lock && lock.count >= 5 && lock.until > Date.now()) {
      throw unauthorized('Too many failed attempts. Try again in a minute.');
    }
    const user = await this.meta.getAdminUser(normalized);
    // Compare against a dummy hash for unknown users so response time doesn't reveal which emails exist.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      const count = (lock && lock.until > Date.now() ? lock.count : 0) + 1;
      this.failures.set(normalized, { count, until: Date.now() + 60_000 });
      throw unauthorized('Invalid email or password');
    }
    this.failures.delete(normalized);
    const admin = { sub: user.pk, email: user.email, name: user.name };
    const token = await new SignJWT({ email: admin.email, name: admin.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(this.key);
    return { token, admin };
  }

  async verify(token: string): Promise<AdminPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      return { sub: String(payload.sub), email: String(payload.email), name: payload.name ? String(payload.name) : undefined };
    } catch {
      throw unauthorized('Session expired. Please sign in again.');
    }
  }
}

export class CognitoAuthenticator implements Authenticator {
  readonly mode = 'cognito' as const;
  private readonly verifier;

  constructor(userPoolId: string, clientId: string) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id', groups: 'admin' });
  }

  async verify(token: string): Promise<AdminPrincipal> {
    try {
      const payload = await this.verifier.verify(token);
      return {
        sub: payload.sub,
        email: String(payload.email ?? payload['cognito:username'] ?? payload.sub),
        name: payload.name ? String(payload.name) : undefined,
      };
    } catch {
      throw unauthorized('Session expired. Please sign in again.');
    }
  }
}

export function createAuthenticator(env: Env, meta: MetaRepository): Authenticator {
  return env.AUTH_MODE === 'cognito'
    ? new CognitoAuthenticator(env.COGNITO_USER_POOL_ID!, env.COGNITO_CLIENT_ID!)
    : new LocalAuthenticator(env.LOCAL_JWT_SECRET!, meta);
}
