import type { Metadata } from 'next';
import { Suspense }         from 'react';
import { getProducts, getCategories } from '@/lib/tenant-api';
import { ProductGrid }    from '@/components/ProductGrid';
import { CategoryFilter } from '@/components/CategoryFilter';
import { SortDropdown }   from '@/components/SortDropdown';

interface PageProps {
  params:       { slug: string };
  searchParams: { category?: string; search?: string; page?: string; sort?: string };
}

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ params, searchParams }: PageProps) {
  const { slug } = params;
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const sort = searchParams.sort ?? 'name_asc';

  const [productsResult, categories] = await Promise.all([
    getProducts(slug, {
      category: searchParams.category,
      search:   searchParams.search,
      page,
      limit:    24,
      sort,
    }),
    getCategories(slug),
  ]);

  const { data: products, meta } = productsResult;

  /** Build a query string preserving current filters */
  function buildQs(overrides: Record<string, string | undefined> = {}): string {
    const qs = new URLSearchParams();
    const merged = {
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

      {/* Search bar + Sort */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <form method="GET" className="flex flex-1 gap-2">
          {searchParams.category && (
            <input type="hidden" name="category" value={searchParams.category} />
          )}
          {sort !== 'name_asc' && (
            <input type="hidden" name="sort" value={sort} />
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
              href={`?${buildQs({ search: undefined })}`}
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

        {/* Sort dropdown (client component) */}
        <Suspense fallback={null}>
          <SortDropdown currentSort={sort} />
        </Suspense>
      </div>

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
          {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`?${buildQs({ page: String(p) })}`}
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
          ))}
        </div>
      )}
    </div>
  );
}
