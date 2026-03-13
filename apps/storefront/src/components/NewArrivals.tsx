import Link from 'next/link';
import { ProductGrid } from './ProductGrid';
import type { Product } from '@/lib/tenant-api';

interface Props {
  products:   Product[];
  tenantSlug: string;
}

export function NewArrivals({ products, tenantSlug }: Props) {
  if (products.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
        >
          New Arrivals
        </h2>
        <Link
          href={`/tenant/${tenantSlug}/products?sort=newest`}
          className="text-sm font-medium hover:opacity-75 transition-opacity"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          Shop more →
        </Link>
      </div>
      <ProductGrid products={products} tenantSlug={tenantSlug} />
    </section>
  );
}
