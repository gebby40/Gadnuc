import { cache } from 'react';

const INVENTORY_URL = process.env.INVENTORY_SERVER_URL ?? 'http://localhost:3001';

export interface TenantInfo {
  id: string;
  slug: string;
  display_name: string;
  status: string;
}

export interface StorefrontSettings {
  theme: string;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  primary_color: string;
  accent_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: Record<string, string>;
  seo_title: string | null;
  seo_description: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  stock_qty: number;
  image_url: string | null;
  is_active: boolean;
}

interface StorefrontData {
  tenant:   TenantInfo;
  settings: StorefrontSettings;
  products: Product[];
}

// cache() de-duplicates requests within a single render pass (React Server Components)
export const getTenantStorefront = cache(async (slug: string): Promise<StorefrontData | null> => {
  try {
    const headers = { 'x-tenant-slug': slug };

    const [tenantRes, productsRes] = await Promise.all([
      fetch(`${INVENTORY_URL}/api/storefront/settings`, {
        headers,
        next: { revalidate: 300 },
      }),
      fetch(`${INVENTORY_URL}/api/products?active=true&limit=12`, {
        headers,
        next: { revalidate: 60 },
      }),
    ]);

    if (!tenantRes.ok) return null;

    const { tenant, settings } = await tenantRes.json();
    const { data: products } = productsRes.ok ? await productsRes.json() : { data: [] };

    return { tenant, settings, products };
  } catch (err) {
    console.error(`[tenant-api] Failed to load storefront for "${slug}":`, err);
    return null;
  }
});
