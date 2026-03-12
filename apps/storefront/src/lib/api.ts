/**
 * Shared fetch helpers for tenant API calls from dashboard pages.
 *
 * All requests go through the Next.js proxy (/api/...) which forwards to
 * the internal inventory-server. The proxy adds cookie-based auth headers,
 * but we also send the Bearer token explicitly for flexibility.
 */

const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

function buildHeaders(slug: string, token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'x-tenant-slug': slug,
    ...extra,
  };
}

export async function tenantFetch(
  slug: string,
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${INVENTORY_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(slug, token),
      ...(options.headers as Record<string, string> ?? {}),
    },
    credentials: 'include',
  });
  return res;
}

export async function tenantGet<T = unknown>(slug: string, token: string, path: string): Promise<T> {
  const res = await tenantFetch(slug, token, path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function tenantPost<T = unknown>(slug: string, token: string, path: string, body: unknown): Promise<T> {
  const res = await tenantFetch(slug, token, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function tenantPatch<T = unknown>(slug: string, token: string, path: string, body: unknown): Promise<T> {
  const res = await tenantFetch(slug, token, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function tenantDelete(slug: string, token: string, path: string): Promise<void> {
  const res = await tenantFetch(slug, token, path, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
}
