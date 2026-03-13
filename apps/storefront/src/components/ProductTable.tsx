'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { Product } from '@/lib/tenant-api';
import { useCart } from './CartProvider';

interface Props {
  products:   Product[];
  tenantSlug: string;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type SortKey = 'name' | 'sku' | 'price' | 'stock' | 'category';
type SortDir = 'asc' | 'desc';

export function ProductTable({ products, tenantSlug }: Props) {
  const { addItem } = useCart();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...products].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':     cmp = a.name.localeCompare(b.name); break;
      case 'sku':      cmp = a.sku.localeCompare(b.sku); break;
      case 'price': {
        const aPrice = a.sale_price_cents ?? a.price_cents;
        const bPrice = b.sale_price_cents ?? b.price_cents;
        cmp = aPrice - bPrice;
        break;
      }
      case 'stock':    cmp = a.stock_qty - b.stock_qty; break;
      case 'category': cmp = (a.category ?? '').localeCompare(b.category ?? ''); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const headerStyle = {
    color: 'var(--color-text)',
    cursor: 'pointer' as const,
    userSelect: 'none' as const,
    background: 'none',
    border: 'none',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '0.75rem 0.5rem',
  };

  if (!products.length) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
        <p className="text-xl">No products available yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card, 0.75rem)' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            <th className="text-left" style={{ ...headerStyle, width: 50, paddingLeft: '1rem' }}></th>
            <th className="text-left">
              <button onClick={() => handleSort('name')} style={headerStyle}>Name{arrow('name')}</button>
            </th>
            <th className="text-left hidden md:table-cell">
              <button onClick={() => handleSort('sku')} style={headerStyle}>SKU{arrow('sku')}</button>
            </th>
            <th className="text-right">
              <button onClick={() => handleSort('price')} style={headerStyle}>Price{arrow('price')}</button>
            </th>
            <th className="text-center hidden sm:table-cell">
              <button onClick={() => handleSort('stock')} style={headerStyle}>Stock{arrow('stock')}</button>
            </th>
            <th className="text-left hidden lg:table-cell">
              <button onClick={() => handleSort('category')} style={headerStyle}>Category{arrow('category')}</button>
            </th>
            <th className="text-center" style={{ ...headerStyle, cursor: 'default', width: 100 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((product, i) => {
            const onSale = product.sale_price_cents != null && product.sale_price_cents < product.price_cents;
            const displayPrice = onSale ? product.sale_price_cents! : product.price_cents;
            const inStock = product.stock_qty > 0;

            return (
              <tr
                key={product.id}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: i % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)',
                }}
              >
                {/* Thumbnail */}
                <td style={{ padding: '0.5rem 0.5rem 0.5rem 1rem' }}>
                  <Link href={`/tenant/${tenantSlug}/products/${product.id}`}>
                    <div
                      className="relative rounded overflow-hidden"
                      style={{ width: 40, height: 40, background: 'var(--color-bg-secondary)' }}
                    >
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          sizes="40px"
                          className="object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                      )}
                    </div>
                  </Link>
                </td>

                {/* Name */}
                <td style={{ padding: '0.5rem' }}>
                  <Link
                    href={`/tenant/${tenantSlug}/products/${product.id}`}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--color-text)', textDecoration: 'none' }}
                  >
                    {product.name}
                  </Link>
                </td>

                {/* SKU */}
                <td className="hidden md:table-cell" style={{ padding: '0.5rem', color: 'var(--color-text-muted)' }}>
                  {product.sku}
                </td>

                {/* Price */}
                <td className="text-right" style={{ padding: '0.5rem' }}>
                  <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                    {formatPrice(displayPrice)}
                  </span>
                  {onSale && (
                    <span className="ml-1.5 line-through text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatPrice(product.price_cents)}
                    </span>
                  )}
                </td>

                {/* Stock */}
                <td className="text-center hidden sm:table-cell" style={{ padding: '0.5rem' }}>
                  <span
                    className="text-xs font-medium"
                    style={{ color: inStock ? '#16a34a' : '#dc2626' }}
                  >
                    {inStock ? product.stock_qty : 'Out'}
                  </span>
                </td>

                {/* Category */}
                <td className="hidden lg:table-cell" style={{ padding: '0.5rem', color: 'var(--color-text-muted)' }}>
                  {product.category ?? '—'}
                </td>

                {/* Add to Cart */}
                <td className="text-center" style={{ padding: '0.5rem' }}>
                  <button
                    onClick={() => {
                      if (inStock) {
                        addItem({
                          productId: product.id,
                          name: product.name,
                          priceCents: displayPrice,
                          imageUrl: product.image_url,
                          quantity: 1,
                        });
                      }
                    }}
                    disabled={!inStock}
                    className="px-3 py-1.5 rounded text-xs font-semibold transition-opacity"
                    style={{
                      background: inStock ? 'var(--color-primary)' : '#e5e7eb',
                      color: inStock ? 'var(--color-primary-fg)' : '#9ca3af',
                      border: 'none',
                      cursor: inStock ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {inStock ? 'Add' : 'N/A'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
