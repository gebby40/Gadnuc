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
export interface ProductVariant {
  id:               string;
  sku:              string | null;
  price_cents:      number | null;
  sale_price_cents: number | null;
  stock:            number;
  weight_oz:        number | null;
  attributes:       Record<string, string>;
  image_url:        string | null;
  is_active:        boolean;
  position:         number;
}

export interface ProductImage {
  id:         string;
  url:        string;
  alt_text:   string;
  position:   number;
  is_primary: boolean;
  variant_id: string | null;
}

export interface Product {
  id:               string;
  sku:              string;
  name:             string;
  description:      string | null;
  category:         string | null;
  price_cents:      number;
  sale_price_cents: number | null;
  stock_qty:        number;
  image_url:        string | null;
  metadata:         Record<string, unknown>;
  weight_oz:        number | null;
  length_in:        number | null;
  width_in:         number | null;
  height_in:        number | null;
  shipping_class:   string;
  tags:             string[];
  brand:            string | null;
  is_featured:      boolean;
  sale_start:       string | null;
  sale_end:         string | null;
  wholesale_price_cents: number | null;
  wholesale_only:       boolean;
  effective_price_cents?: number;
  product_type?:    'simple' | 'variable';
  review_count?:    number;
  avg_rating?:      number;
  variants?:        ProductVariant[];
  images?:          ProductImage[];
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
  params: {
    category?: string; search?: string; page?: number; limit?: number; sort?: string;
    min_price?: string; max_price?: string; brand?: string; in_stock?: string; on_sale?: string; min_rating?: string;
  } = {},
): Promise<ProductListResult> {
  const qs = new URLSearchParams();
  if (params.category)  qs.set('category',  params.category);
  if (params.search)    qs.set('search',    params.search);
  if (params.page)      qs.set('page',      String(params.page));
  if (params.limit)     qs.set('limit',     String(params.limit));
  if (params.sort)      qs.set('sort',      params.sort);
  if (params.min_price) qs.set('min_price', params.min_price);
  if (params.max_price) qs.set('max_price', params.max_price);
  if (params.brand)     qs.set('brand',     params.brand);
  if (params.in_stock)  qs.set('in_stock',  params.in_stock);
  if (params.on_sale)   qs.set('on_sale',   params.on_sale);
  if (params.min_rating)qs.set('min_rating',params.min_rating);

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

// ── Filter Facets ────────────────────────────────────────────────────────────
export interface FilterFacets {
  categories: { category: string; count: number }[];
  brands:     { brand: string; count: number }[];
  priceRange: { min: number; max: number };
}

export const getFilterFacets = cache(async (slug: string): Promise<FilterFacets> => {
  try {
    const res = await fetch(apiUrl('/api/storefront/filters'), {
      headers: tenantHeaders(slug),
      next: { revalidate: 120, tags: [`tenant:${slug}:filters`] },
    });
    if (!res.ok) return { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
    const body = await res.json();
    return body.data ?? { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
  } catch {
    return { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
  }
});

// ── Authenticated product fetchers (for wholesale customers) ─────────────────

const CLIENT_API_BASE = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

function clientApiUrl(path: string) {
  return `${CLIENT_API_BASE}${path}`;
}

export async function getProductsAuthenticated(
  slug: string,
  token: string,
  params: { category?: string; search?: string; page?: number; limit?: number; sort?: string } = {},
): Promise<ProductListResult> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.search)   qs.set('search',   params.search);
  if (params.page)     qs.set('page',     String(params.page));
  if (params.limit)    qs.set('limit',    String(params.limit));
  if (params.sort)     qs.set('sort',     params.sort);

  try {
    const res = await fetch(clientApiUrl(`/api/storefront/products?${qs}`), {
      headers: {
        'x-tenant-slug': slug,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return { data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } };
    return res.json();
  } catch {
    return { data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } };
  }
}

export async function getProductAuthenticated(
  slug: string,
  id: string,
  token: string,
): Promise<Product | null> {
  try {
    const res = await fetch(clientApiUrl(`/api/storefront/products/${id}`), {
      headers: {
        'x-tenant-slug': slug,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ── Related Products ─────────────────────────────────────────────────────────
export async function getRelatedProducts(
  slug: string,
  productId: string,
  _category: string | null,
  limit = 4,
): Promise<Product[]> {
  try {
    const res = await fetch(
      apiUrl(`/api/storefront/products/${productId}/related?limit=${limit}`),
      { headers: tenantHeaders(slug), next: { revalidate: 60, tags: [`tenant:${slug}:related:${productId}`] } },
    );
    if (!res.ok) return [];
    const body = await res.json();
    return body.data ?? [];
  } catch {
    return [];
  }
}

// ── Featured / New Arrivals ──────────────────────────────────────────────────
export async function getNewArrivals(slug: string, limit = 4): Promise<Product[]> {
  const result = await getProducts(slug, { limit, sort: 'newest' });
  return result.data;
}

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
  variantId?: string;
  quantity:  number;
}

// ── Shipping Calculation ─────────────────────────────────────────────────────
export interface ShippingMethod {
  id: string;
  title: string;
  type: string;
  costCents: number;
  zoneName: string;
}

export async function calculateShipping(
  slug: string,
  params: { subtotalCents: number; totalItems: number; totalWeightOz?: number; country?: string; state?: string; zip?: string },
): Promise<{ methods: ShippingMethod[] }> {
  const res = await fetch(apiUrl('/api/storefront/shipping/calculate'), {
    method: 'POST',
    headers: tenantHeaders(slug),
    body: JSON.stringify(params),
    cache: 'no-store',
  });
  if (!res.ok) return { methods: [] };
  return res.json();
}

// ── Tax Calculation ──────────────────────────────────────────────────────────
export interface TaxBreakdownLine {
  name: string;
  ratePct: number;
  amountCents: number;
}

export interface TaxCalculation {
  taxCents: number;
  breakdown: TaxBreakdownLine[];
}

export async function calculateTax(
  slug: string,
  subtotalCents: number,
  address: { country?: string; state?: string; zip?: string } = {},
): Promise<TaxCalculation> {
  const res = await fetch(apiUrl('/api/storefront/tax/calculate'), {
    method: 'POST',
    headers: tenantHeaders(slug),
    body: JSON.stringify({ subtotalCents, ...address }),
    cache: 'no-store',
  });
  if (!res.ok) return { taxCents: 0, breakdown: [] };
  return res.json();
}

export interface CouponValidation {
  valid: boolean;
  coupon: {
    id: string;
    code: string;
    type: 'percentage' | 'fixed' | 'free_shipping';
    value: number;
    discountCents: number;
  };
}

export async function validateCoupon(
  slug: string,
  code: string,
  subtotalCents: number,
): Promise<CouponValidation> {
  const res = await fetch(apiUrl('/api/storefront/coupons/validate'), {
    method: 'POST',
    headers: tenantHeaders(slug),
    body: JSON.stringify({ code, subtotalCents }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Invalid coupon');
  }
  return res.json();
}

export async function createCheckoutSession(
  slug:          string,
  items:         CheckoutItem[],
  successUrl:    string,
  cancelUrl:     string,
  customerEmail?: string,
  token?:        string,
  couponCode?:   string,
): Promise<{ url: string; sessionId: string }> {
  const headers: Record<string, string> = { ...tenantHeaders(slug) as Record<string, string> };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(apiUrl('/api/storefront/checkout'), {
    method:  'POST',
    headers,
    body:    JSON.stringify({ items, successUrl, cancelUrl, customerEmail, couponCode }),
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
  tracking_number:  string | null;
  tracking_carrier: string | null;
  tracking_url:     string | null;
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

// ── Product Reviews ──────────────────────────────────────────────────────────
export interface ProductReview {
  id:            string;
  customer_name: string;
  rating:        number;
  title:         string | null;
  body:          string | null;
  created_at:    string;
}

export interface ReviewListResult {
  data: ProductReview[];
  meta: { page: number; limit: number; total: number };
}

export async function getProductReviews(
  slug: string,
  productId: string,
  page = 1,
  limit = 10,
): Promise<ReviewListResult> {
  try {
    const res = await fetch(
      apiUrl(`/api/storefront/products/${productId}/reviews?page=${page}&limit=${limit}`),
      { headers: tenantHeaders(slug), next: { revalidate: 60, tags: [`tenant:${slug}:reviews:${productId}`] } },
    );
    if (!res.ok) return { data: [], meta: { page, limit, total: 0 } };
    return res.json();
  } catch {
    return { data: [], meta: { page, limit, total: 0 } };
  }
}

// ── Wishlist ─────────────────────────────────────────────────────────────────
export interface WishlistItem {
  id:              string;
  product_id:      string;
  variant_id:      string | null;
  name:            string;
  price_cents:     number;
  sale_price_cents: number | null;
  image_url:       string | null;
  stock_qty:       number;
  created_at:      string;
}
