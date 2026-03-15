import type { Metadata } from 'next';
import { Suspense }         from 'react';
import { getProducts, getCategories, getFilterFacets } from '@/lib/tenant-api';
import { CategoryFilter } from '@/components/CategoryFilter';
import { SortDropdown }   from '@/components/SortDropdown';
import { ProductFilters } from '@/components/ProductFilters';
import { ProductsDisplay } from './ProductsDisplay';

interface PageProps {
  params:       { slug: string };
  searchParams: {
    category?: string; search?: string; page?: string; sort?: string;
    min_price?: string; max_price?: string; brand?: string; in_stock?: string; on_sale?: string; min_rating?: string;
  };
}

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ params, searchParams }: PageProps) {
  const { slug } = params;
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const sort = searchParams.sort ?? 'name_asc';

  const [productsResult, categories, facets] = await Promise.all([
    getProducts(slug, {
      category:  searchParams.category,
      search:    searchParams.search,
      page,
      limit:     24,
      sort,
      min_price: searchParams.min_price,
      max_price: searchParams.max_price,
      brand:     searchParams.brand,
      in_stock:  searchParams.in_stock,
      on_sale:   searchParams.on_sale,
      min_rating:searchParams.min_rating,
    }),
    getCategories(slug),
    getFilterFacets(slug),
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
              href={`?${new URLSearchParams(Object.entries({ category: searchParams.category, sort: searchParams.sort }).filter(([, v]) => v) as [string, string][]).toString()}`}
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

      {/* Filters + Product grid */}
      <div className="flex gap-8">
        {/* Sidebar filters */}
        {(facets.brands.length > 0 || facets.priceRange.max > 0) && (
          <aside className="hidden md:block" style={{ width: 200, flexShrink: 0 }}>
            <Suspense fallback={null}>
              <ProductFilters facets={facets} />
            </Suspense>
          </aside>
        )}

        {/* Product grid / table — wholesale-aware client wrapper */}
        <div className="flex-1 min-w-0">
          <ProductsDisplay
            slug={slug}
            ssrProducts={products}
            ssrMeta={meta}
            searchParams={{
              category: searchParams.category,
              search: searchParams.search,
              page,
              sort,
            }}
            currentPage={page}
          />
        </div>
      </div>
    </div>
  );
}
