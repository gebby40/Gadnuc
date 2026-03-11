import Link  from 'next/link';
import Image from 'next/image';
import type { Product } from '@/lib/tenant-api';

interface Props {
  products:   Product[];
  tenantSlug: string;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ProductGrid({ products, tenantSlug }: Props) {
  if (!products.length) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
        <p className="text-xl">No products available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/tenant/${tenantSlug}/products/${product.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <article
            className="group overflow-hidden transition-all duration-200 cursor-pointer"
            style={{
              border:       '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              background:   'var(--color-surface)',
              boxShadow:    'var(--shadow-card)',
            }}
          >
            {/* Image */}
            <div className="relative overflow-hidden" style={{ height: '200px', background: 'var(--color-bg-secondary)' }}>
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: 'var(--color-border)' }}>
                  📦
                </div>
              )}
              {product.stock_qty === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  Out of Stock
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-4">
              {product.category && (
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {product.category}
                </p>
              )}
              <h3 className="font-semibold mb-2 line-clamp-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}>
                {product.name}
              </h3>
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                  {formatPrice(product.price_cents)}
                </span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: product.stock_qty > 0 ? '#dcfce7' : '#fee2e2',
                    color:      product.stock_qty > 0 ? '#16a34a' : '#dc2626',
                  }}
                >
                  {product.stock_qty > 0 ? 'In Stock' : 'Sold Out'}
                </span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}
