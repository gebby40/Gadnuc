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
 * Product grid with WordPress/WooCommerce-style constrained image cards.
 *
 * Each card has a fixed max-width of 320px so images stay sharp and
 * consistent regardless of the source file dimensions.  Next.js Image
 * optimisation is enabled — images are served as WebP at the appropriate
 * size (roughly 320×427 for the 3:4 grid thumbnails on 1x, 640×854 on 2x).
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
    <div
      className="grid gap-x-5 gap-y-8"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        maxWidth: '100%',
      }}
    >
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/tenant/${tenantSlug}/products/${product.id}`}
          style={{ textDecoration: 'none', color: 'inherit', maxWidth: '320px' }}
        >
          <article className="group cursor-pointer">
            {/* Thumbnail — capped at 320×427 (3:4) */}
            <div
              className="relative overflow-hidden mb-3"
              style={{
                aspectRatio: '3 / 4',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-card)',
                maxWidth:  '320px',
                maxHeight: '427px',
              }}
            >
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  quality={80}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-5xl"
                  style={{ color: 'var(--color-border)' }}
                >
                  📦
                </div>
              )}
              {product.stock_qty === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-sm font-semibold tracking-wide uppercase"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  Sold Out
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ maxWidth: '320px' }}>
              <h3
                className="font-medium text-sm mb-1 line-clamp-2"
                style={{ color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}
              >
                {product.name}
              </h3>
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {formatPrice(product.price_cents)}
              </span>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}
