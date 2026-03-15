'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import type { FilterFacets } from '@/lib/tenant-api';

interface Props {
  facets: FilterFacets;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function ProductFilters({ facets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page'); // Reset to page 1 on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const currentBrand = searchParams.get('brand');
  const currentInStock = searchParams.get('in_stock');
  const currentOnSale = searchParams.get('on_sale');
  const currentMinRating = searchParams.get('min_rating');

  const hasActiveFilters = currentBrand || currentInStock || currentOnSale || currentMinRating;

  return (
    <div className="flex flex-col gap-5">
      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            ['brand', 'in_stock', 'on_sale', 'min_rating', 'min_price', 'max_price'].forEach((k) => params.delete(k));
            router.push(`${pathname}?${params.toString()}`);
          }}
          className="text-xs font-medium underline"
          style={{ color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          Clear all filters
        </button>
      )}

      {/* In Stock */}
      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={currentInStock === 'true'}
            onChange={(e) => updateFilter('in_stock', e.target.checked ? 'true' : null)}
          />
          In Stock only
        </label>
      </div>

      {/* On Sale */}
      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={currentOnSale === 'true'}
            onChange={(e) => updateFilter('on_sale', e.target.checked ? 'true' : null)}
          />
          On Sale
        </label>
      </div>

      {/* Brand filter */}
      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Brand
          </h3>
          <div className="flex flex-col gap-1">
            {facets.brands.map((b) => (
              <button
                key={b.brand}
                onClick={() => updateFilter('brand', currentBrand === b.brand ? null : b.brand)}
                className="text-left text-sm px-2 py-1 rounded transition-colors"
                style={{
                  background: currentBrand === b.brand ? 'var(--color-primary)' : 'transparent',
                  color: currentBrand === b.brand ? 'var(--color-primary-fg)' : 'var(--color-text)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {b.brand} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>({b.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rating filter */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Min Rating
        </h3>
        <div className="flex flex-col gap-1">
          {[4, 3, 2, 1].map((r) => (
            <button
              key={r}
              onClick={() => updateFilter('min_rating', currentMinRating === String(r) ? null : String(r))}
              className="text-left text-sm px-2 py-1 rounded transition-colors"
              style={{
                background: currentMinRating === String(r) ? 'var(--color-primary)' : 'transparent',
                color: currentMinRating === String(r) ? 'var(--color-primary-fg)' : 'var(--color-text)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {'\u2605'.repeat(r)}{'\u2606'.repeat(5 - r)} & up
            </button>
          ))}
        </div>
      </div>

      {/* Price range */}
      {facets.priceRange.max > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Price Range
          </h3>
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {formatPrice(facets.priceRange.min)} — {formatPrice(facets.priceRange.max)}
          </p>
        </div>
      )}
    </div>
  );
}
