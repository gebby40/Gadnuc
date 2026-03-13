'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { loadAuthState } from '@/lib/auth';
import type { Product } from '@/lib/tenant-api';
import { getProductAuthenticated } from '@/lib/tenant-api';

interface Props {
  slug: string;
  productId: string;
  ssrProduct: Product;
  children: (product: Product) => React.ReactNode;
}

/**
 * Wraps the product detail page for wholesale-aware rendering.
 * If the logged-in user is a wholesale customer, re-fetches the product
 * with their auth token so the server returns the wholesale price.
 */
export function WholesaleProductDetail({ slug, productId, ssrProduct, children }: Props) {
  const { user } = useAuth();
  const [product, setProduct] = useState<Product>(ssrProduct);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.isWholesale) {
      setProduct(ssrProduct);
      return;
    }

    const state = loadAuthState();
    if (!state?.token) return;

    setLoading(true);
    getProductAuthenticated(slug, productId, state.token)
      .then((result) => {
        if (result) setProduct(result);
      })
      .catch(() => {
        setProduct(ssrProduct);
      })
      .finally(() => setLoading(false));
  }, [user?.isWholesale, slug, productId, ssrProduct]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Loading wholesale pricing…
      </div>
    );
  }

  return <>{children(product)}</>;
}
