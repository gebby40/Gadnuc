import type { Metadata } from 'next';
import { Suspense }         from 'react';
import { getProducts, getCategories } from '@/lib/tenant-api';
import { ProductGrid }    from '@/components/ProductGrid';
import { CategoryFilter } from '@/components/CategoryFilter';

interface PageProps {
  params:       { slug: string };
  searchParams: { category?: string; search?: string; page?: string };
}

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ params, searchParams }: PageProps) {
  const { slug } = params;
  const page     = parseInt(searchParams.page ?? '1', 10) || 1;

  const [productsResult, categories] = await Promise.all([
    getProducts(slug, {
      category: searchParams.category,
      search:   searchParams.search,
      page,
      limit:    24,
    }),
    getCategories(slug),
  ]);

  const { data: products, meta } = productsResult;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
        >
          {searchParams.category ? searchParams.category : 'All Products'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {meta.total} {meta.total === 1 ? 'product' : 'products'}
        </p>
      </div>

      {/* Search bar */}
      <form method="GET" className="mb-6 flex gap-2">
        {searchParams.category && (
          <input type="hidden" name="category" value={searchParams.category} />
        )}
        <input
          type="text"
          name="search"
          defaultValue={searchParams.search}
          placeholder="Search products…"
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            border:     '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color:      'var(--color-text)',
          }}
        />
        <button
          type="submit"
          className="px-5 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
        >
          Search
        </button>
        {searchParams.search && (
          <a
            href={`?${searchParams.category ? `category=${searchParams.category}` : ''}`}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              border: '1px solid var(--color-border)',
              color:  'var(--color-text-muted)',
              textDecoration: 'none',
            }}
          >
            Clear
          </a>
        )}
      </form>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="mb-8">
          <Suspense fallback={null}>
            <CategoryFilter
              categories={categories}
              selectedCategory={searchParams.category}
            />
          </Suspense>
        </div>
      )}

      {/* Product grid */}
      <ProductGrid products={products} tenantSlug={slug} />

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="mt-12 flex justify-center gap-2 flex-wrap">
          {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => {
            const qs = new URLSearchParams();
            if (searchParams.category) qs.set('category', searchParams.category);
            if (searchParams.search)   qs.set('search',   searchParams.search);
            qs.set('page', String(p));
            return (
              <a
                key={p}
                href={`?${qs}`}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium"
                style={{
                  background:     p === page ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                  color:          p === page ? 'var(--color-primary-fg)' : 'var(--color-text)',
                  border:         '1px solid var(--color-border)',
                  textDecoration: 'none',
                }}
              >
                {p}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
