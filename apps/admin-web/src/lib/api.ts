export const API_BASE = `${(import.meta.env.VITE_ADMIN_API_URL ?? 'http://localhost:4001').replace(/\/$/, '')}/admin/v1`;
export const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'gnj_admin_token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface IssueDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Maps validation issues to { "customer.phone": "message" }. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as IssueDetail[]) if (d?.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the admin API. Is it running?');
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    tokenStore.clear();
    window.dispatchEvent(new Event('gnj:unauthorized'));
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'ERROR',
      data?.error?.message ?? `Request failed (${res.status})`,
      data?.error?.details,
    );
  }
  return data as T;
}

export type UploadPurpose = 'product-image' | 'category-image' | 'banner-image' | 'import';

/** Presigned POST straight to S3/MinIO, with progress. */
export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (fraction: number) => void,
): Promise<{ key: string; publicUrl?: string }> {
  const presign = await api<{ url: string; fields: Record<string, string>; key: string; maxBytes: number; publicUrl?: string }>(
    '/uploads/presign',
    { method: 'POST', body: { purpose, filename: file.name, contentType: file.type || 'application/octet-stream' } },
  );
  if (file.size > presign.maxBytes) {
    throw new ApiError(400, 'TOO_LARGE', `${file.name} is larger than ${Math.round(presign.maxBytes / 1048576)} MB`);
  }
  const form = new FormData();
  Object.entries(presign.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', presign.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', `Upload of ${file.name} failed (${xhr.status})`));
    xhr.onerror = () => reject(new ApiError(0, 'UPLOAD_FAILED', `Upload of ${file.name} failed`));
    xhr.send(form);
  });
  onProgress?.(1);
  return { key: presign.key, publicUrl: presign.publicUrl };
}
