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

/**
 * WooCommerce-style product grid with fixed column counts.
 *
 * Layout: 2 cols mobile → 3 cols tablet → 4 cols desktop
 * Images: square 1:1 thumbnails (like WooCommerce default),
 *         max 260px wide, served as optimised WebP via Next.js.
 */
export function ProductGrid({ products, tenantSlug }: Props) {
  if (!products.length) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
        <p className="text-xl">No products available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 sm:gap-x-5 sm:gap-y-8">
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/tenant/${tenantSlug}/products/${product.id}`}
          className="block"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <article className="group cursor-pointer">
            {/* Square thumbnail like WooCommerce */}
            <div
              className="relative overflow-hidden mb-2 sm:mb-3"
              style={{
                aspectRatio: '1 / 1',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 260px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  quality={80}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-4xl sm:text-5xl"
                  style={{ color: 'var(--color-border)' }}
                >
                  📦
                </div>
              )}
              {product.stock_qty === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-semibold tracking-wide uppercase"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  Sold Out
                </div>
              )}
            </div>

            {/* Product info */}
            <h3
              className="font-medium text-xs sm:text-sm mb-0.5 line-clamp-2 leading-snug"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}
            >
              {product.name}
            </h3>
            <span
              className="text-xs sm:text-sm font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {formatPrice(product.price_cents)}
            </span>
          </article>
        </Link>
      ))}
    </div>
  );
}
