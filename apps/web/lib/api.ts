import type { Category, HomeData, Product, ProductList, PublicSettings } from './types';

/** Server-side base URL (inside the network); falls back to the public one. */
const SERVER_API = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
/** Browser base URL. */
export const PUBLIC_API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
/** Inlined at build time so the server bundle needs no runtime env (avoids a CloudFront ↔ Lambda dependency cycle). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const REVALIDATE_SECONDS = 60;

async function get<T>(path: string, revalidate = REVALIDATE_SECONDS): Promise<T> {
  const res = await fetch(`${SERVER_API}/v1${path}`, { next: { revalidate } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const getSettings = () => get<PublicSettings>('/settings/public');
export const getCategories = () => get<{ items: Category[] }>('/categories').then((r) => r.items);
export const getHome = () => get<HomeData>('/home');
export const getProduct = (slug: string) =>
  get<{ product: Product; related: Product[] }>(`/products/${encodeURIComponent(slug)}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

export function getProducts(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return get<ProductList>(`/products?${qs}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
}

/** Browser-side JSON call to the public API. */
export async function clientApi<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API}/v1${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'We could not reach the store. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as ({ error?: { code?: string; message?: string; details?: unknown } } & T) | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Something went wrong', data?.error?.details);
  }
  return data as T;
}
