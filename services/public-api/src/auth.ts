import { unauthorized } from '@gnj/core';
import { jwtVerify, SignJWT } from 'jose';
import type { MiddlewareHandler } from 'hono';

export type AccountEnv = { Variables: { accountId: string } };

const ISSUER = 'gnj-public-api';
const AUDIENCE = 'gnj-account';

/** Long-lived — this is a shopper's storefront session, not an admin credential. */
const EXPIRY = '30d';

export async function signAccountToken(accountId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(accountId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(key);
}

export async function verifyAccountToken(token: string, secret: string): Promise<string> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    return String(payload.sub);
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }
}

/** Sets `accountId` on the context, or throws 401 — for routes that require a signed-in shopper. */
export function requireAccount(secret: string | undefined): MiddlewareHandler<AccountEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!secret || !token) throw unauthorized();
    c.set('accountId', await verifyAccountToken(token, secret));
    await next();
  };
}
