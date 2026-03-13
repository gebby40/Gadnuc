'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { loadAuthState } from '@/lib/auth';
import type { Product, ProductListResult } from '@/lib/tenant-api';
import { getProductsAuthenticated } from '@/lib/tenant-api';

interface Props {
  slug: string;
  ssrProducts: Product[];
  ssrMeta: { page: number; limit: number; total: number; totalPages: number };
  searchParams: { category?: string; search?: string; page?: number; sort?: string };
  children: (products: Product[], meta: { page: number; limit: number; total: number; totalPages: number }) => React.ReactNode;
}

/**
 * Wraps the product listing for wholesale-aware rendering.
 * If the logged-in user is a wholesale customer, re-fetches products with
 * their auth token so the server returns wholesale pricing + wholesale-only items.
 * Otherwise, renders the SSR-provided products as-is.
 */
export function WholesaleProductLoader({ slug, ssrProducts, ssrMeta, searchParams, children }: Props) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>(ssrProducts);
  const [meta, setMeta] = useState(ssrMeta);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.isWholesale) {
      // Reset to SSR data when user is not wholesale
      setProducts(ssrProducts);
      setMeta(ssrMeta);
      return;
    }

    const state = loadAuthState();
    if (!state?.token) return;

    setLoading(true);
    getProductsAuthenticated(slug, state.token, {
      category: searchParams.category,
      search: searchParams.search,
      page: searchParams.page,
      limit: 24,
      sort: searchParams.sort,
    })
      .then((result: ProductListResult) => {
        setProducts(result.data);
        setMeta(result.meta);
      })
      .catch(() => {
        // Fallback to SSR data on error
        setProducts(ssrProducts);
        setMeta(ssrMeta);
      })
      .finally(() => setLoading(false));
  }, [user?.isWholesale, slug, searchParams.category, searchParams.search, searchParams.page, searchParams.sort, ssrProducts, ssrMeta]);

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Loading wholesale catalog…
        </div>
      )}
      {children(products, meta)}
    </>
  );
}
