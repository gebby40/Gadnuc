'use client';

import { useState, useEffect } from 'react';
import type { Product } from '@/lib/tenant-api';
import { ProductGrid } from './ProductGrid';
import { ProductTable } from './ProductTable';

interface Props {
  products:   Product[];
  tenantSlug: string;
}

const STORAGE_KEY = 'gadnuc_view_mode';

export function ViewToggle({ products, tenantSlug }: Props) {
  const [view, setView] = useState<'grid' | 'table'>('grid');

  // Hydrate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'table') setView('table');
  }, []);

  function toggle(mode: 'grid' | 'table') {
    setView(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  const btnBase = {
    border: 'none',
    cursor: 'pointer' as const,
    padding: '0.4rem 0.6rem',
    borderRadius: '0.375rem',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex justify-end mb-4 gap-1">
        <button
          onClick={() => toggle('grid')}
          style={{
            ...btnBase,
            background: view === 'grid' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: view === 'grid' ? 'var(--color-primary-fg)' : 'var(--color-text-muted)',
          }}
          aria-label="Grid view"
          title="Grid view"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => toggle('table')}
          style={{
            ...btnBase,
            background: view === 'table' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: view === 'table' ? 'var(--color-primary-fg)' : 'var(--color-text-muted)',
          }}
          aria-label="Table view"
          title="Table view"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="4" width="18" height="2" rx="0.5" />
            <rect x="3" y="9" width="18" height="2" rx="0.5" />
            <rect x="3" y="14" width="18" height="2" rx="0.5" />
            <rect x="3" y="19" width="18" height="2" rx="0.5" />
          </svg>
        </button>
      </div>

      {/* Render selected view */}
      {view === 'grid' ? (
        <ProductGrid products={products} tenantSlug={tenantSlug} />
      ) : (
        <ProductTable products={products} tenantSlug={tenantSlug} />
      )}
    </div>
  );
}
