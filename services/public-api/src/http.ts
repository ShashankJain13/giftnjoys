import { AppError, badRequest, toIssues } from '@gnj/core';
import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return parseWith(schema, json);
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', toIssues(result.error));
  }
  return result.data;
}

export function cacheFor(c: Context, seconds: number) {
  c.header('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds * 2}, stale-while-revalidate=${seconds * 4}`);
}

export function noStore(c: Context) {
  c.header('Cache-Control', 'no-store');
}

export function clientIp(c: Context): string {
  const env = c.env as
    | { event?: { requestContext?: { http?: { sourceIp?: string } } }; incoming?: { socket?: { remoteAddress?: string } } }
    | undefined;
  return (
    env?.event?.requestContext?.http?.sourceIp ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    env?.incoming?.socket?.remoteAddress ??
    'unknown'
  );
}

/**
 * Best-effort fixed-window limiter per container/process. In AWS, API Gateway throttling and WAF
 * rate-based rules are the real protection; this just blunts bursts from a single client.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string }): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    const key = clientIp(c);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
    } else if (++entry.count > opts.max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    }
    await next();
  };
}
