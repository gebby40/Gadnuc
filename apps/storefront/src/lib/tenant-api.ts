/**
 * Tenant-scoped API helpers for the storefront (Next.js server components).
 * All fetches are tagged for Next.js on-demand revalidation.
 */

import { cache } from 'react';

const API_BASE = process.env.INVENTORY_SERVER_URL ?? 'http://localhost:3001';

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function tenantHeaders(slug: string): HeadersInit {
  return { 'x-tenant-slug': slug, 'Content-Type': 'application/json' };
}

// ── Storefront settings ───────────────────────────────────────────────────────
export interface StorefrontSettings {
  theme?:            string;
  logo_url?:         string | null;
  hero_title?:       string;
  hero_subtitle?:    string | null;
  hero_image_url?:   string | null;
  hero_enabled?:     boolean;
  primary_color?:    string;
  accent_color?:     string;
  nav_bg_color?:     string | null;
  nav_text_color?:   string | null;
  footer_bg_color?:  string | null;
  footer_text_color?:string | null;
  store_name?:       string | null;
  contact_email?:    string | null;
  contact_phone?:    string | null;
  social_links?:     Record<string, string>;
  seo_title?:        string | null;
  seo_description?:  string | null;
  custom_css?:       string | null;
  custom_homepage_enabled?: boolean;
  custom_homepage_url?:     string | null;
}

export const getTenantSettings = cache(async (slug: string): Promise<StorefrontSettings> => {
  try {
    const res = await fetch(apiUrl('/api/storefront/settings'), {
      headers: tenantHeaders(slug),
      next: { revalidate: 60, tags: [`tenant:${slug}:settings`] },
    });
    if (!res.ok) return {};
    const body = await res.json();
    return body.data ?? {};
  } catch {
    return {};
  }
});

// ── Products ──────────────────────────────────────────────────────────────────
export interface Product {
  id:          string;
  sku:         string;
  name:        string;
  description: string | null;
  category:    string | null;
  price_cents: number;
  stock_qty:   number;
  image_url:   string | null;
  metadata:    Record<string, unknown>;
}

export interface ProductListMeta {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
}

export interface ProductListResult {
  data: Product[];
  meta: ProductListMeta;
}

export async function getProducts(
  slug: string,
  params: { category?: string; search?: string; page?: number; limit?: number; sort?: string } = {},
): Promise<ProductListResult> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.search)   qs.set('search',   params.search);
  if (params.page)     qs.set('page',     String(params.page));
  if (params.limit)    qs.set('limit',    String(params.limit));
  if (params.sort)     qs.set('sort',     params.sort);

  try {
    const res = await fetch(apiUrl(`/api/storefront/products?${qs}`), {
      headers: tenantHeaders(slug),
      next: { revalidate: 30, tags: [`tenant:${slug}:products`] },
    });
    if (!res.ok) return { data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } };
    return res.json();
  } catch {
    return { data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } };
  }
}

export const getProduct = cache(async (slug: string, id: string): Promise<Product | null> => {
  try {
    const res = await fetch(apiUrl(`/api/storefront/products/${id}`), {
      headers: tenantHeaders(slug),
      next: { revalidate: 30, tags: [`tenant:${slug}:product:${id}`] },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
});

export const getCategories = cache(async (slug: string): Promise<string[]> => {
  try {
    const res = await fetch(apiUrl('/api/storefront/categories'), {
      headers: tenantHeaders(slug),
      next: { revalidate: 120, tags: [`tenant:${slug}:categories`] },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return body.data ?? [];
  } catch {
    return [];
  }
});

// Backwards-compatible: used by existing homepage page.tsx
export interface TenantInfo {
  id:           string;
  slug:         string;
  display_name: string;
  status:       string;
}

interface StorefrontData {
  tenant:   TenantInfo | null;
  settings: StorefrontSettings;
  products: Product[];
}

export const getTenantStorefront = cache(async (slug: string): Promise<StorefrontData> => {
  const [settings, productsResult] = await Promise.all([
    getTenantSettings(slug),
    getProducts(slug, { limit: 12 }),
  ]);
  return {
    tenant:   null,          // tenant info not needed on homepage
    settings,
    products: productsResult.data,
  };
});

// ── Checkout ──────────────────────────────────────────────────────────────────
export interface CheckoutItem {
  productId: string;
  quantity:  number;
}

export async function createCheckoutSession(
  slug:          string,
  items:         CheckoutItem[],
  successUrl:    string,
  cancelUrl:     string,
  customerEmail?: string,
): Promise<{ url: string; sessionId: string }> {
  const res = await fetch(apiUrl('/api/storefront/checkout'), {
    method:  'POST',
    headers: tenantHeaders(slug),
    body:    JSON.stringify({ items, successUrl, cancelUrl, customerEmail }),
    cache:   'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Checkout failed');
  }
  return res.json();
}

// ── Orders ────────────────────────────────────────────────────────────────────
export interface OrderItem {
  sku:              string;
  name:             string;
  quantity:         number;
  unit_price_cents: number;
  image_url:        string | null;
  product_id:       string | null;
}

export interface Order {
  id:               string;
  order_number:     string;
  customer_name:    string;
  customer_email:   string | null;
  status:           string;
  total_cents:      number;
  shipping_address: Record<string, unknown> | null;
  created_at:       string;
  updated_at:       string;
  items:            OrderItem[];
}

export async function getOrder(slug: string, orderNumber: string): Promise<Order | null> {
  try {
    const res = await fetch(apiUrl(`/api/storefront/orders/${encodeURIComponent(orderNumber)}`), {
      headers: tenantHeaders(slug),
      cache:   'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ── Analytics (client-side fire-and-forget) ───────────────────────────────────
export async function trackPageView(slug: string, pagePath: string, sessionId?: string) {
  try {
    await fetch(apiUrl('/api/storefront/analytics'), {
      method:  'POST',
      headers: tenantHeaders(slug),
      body:    JSON.stringify({ eventType: 'page_view', pagePath, sessionId }),
      cache:   'no-store',
    });
  } catch { /* non-critical */ }
}

export async function trackEvent(
  slug:      string,
  eventType: 'product_view' | 'add_to_cart' | 'checkout_start' | 'order_complete',
  extra:     { pagePath?: string; productId?: string; sessionId?: string; metadata?: Record<string, unknown> } = {},
) {
  try {
    await fetch(apiUrl('/api/storefront/analytics'), {
      method:  'POST',
      headers: tenantHeaders(slug),
      body:    JSON.stringify({ eventType, ...extra }),
      cache:   'no-store',
    });
  } catch { /* non-critical */ }
}
