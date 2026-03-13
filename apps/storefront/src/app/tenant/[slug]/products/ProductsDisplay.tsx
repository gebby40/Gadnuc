'use client';

import type { Product, ProductListMeta } from '@/lib/tenant-api';
import { ViewToggle } from '@/components/ViewToggle';
import { WholesaleProductLoader } from '@/components/WholesaleProductLoader';

interface Props {
  slug: string;
  ssrProducts: Product[];
  ssrMeta: ProductListMeta;
  searchParams: { category?: string; search?: string; page?: number; sort?: string };
  currentPage: number;
}

export function ProductsDisplay({ slug, ssrProducts, ssrMeta, searchParams, currentPage }: Props) {
  /** Build a query string preserving current filters */
  function buildQs(overrides: Record<string, string | undefined> = {}): string {
    const qs = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      category: searchParams.category,
      search: searchParams.search,
      sort: searchParams.sort,
      ...overrides,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    return qs.toString();
  }

  return (
    <WholesaleProductLoader
      slug={slug}
      ssrProducts={ssrProducts}
      ssrMeta={ssrMeta}
      searchParams={searchParams}
    >
      {(products, meta) => (
        <>
          <ViewToggle products={products} tenantSlug={slug} />

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="mt-12 flex justify-center gap-2 flex-wrap">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
                <a
                  key={p}
                  href={`?${buildQs({ page: String(p) })}`}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium"
                  style={{
                    background:     p === currentPage ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                    color:          p === currentPage ? 'var(--color-primary-fg)' : 'var(--color-text)',
                    border:         '1px solid var(--color-border)',
                    textDecoration: 'none',
                  }}
                >
                  {p}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </WholesaleProductLoader>
  );
}
