import type { Metadata } from 'next';
import { notFound }  from 'next/navigation';
import Image         from 'next/image';
import Link          from 'next/link';
import { getProduct } from '@/lib/tenant-api';
import { AddToCartButton } from '@/components/AddToCartButton';

interface PageProps {
  params: { slug: string; id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProduct(params.slug, params.id);
  if (!product) return { title: 'Product Not Found' };
  return {
    title:       product.name,
    description: product.description ?? undefined,
  };
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = await getProduct(params.slug, params.id);
  if (!product) notFound();

  const inStock     = product.stock_qty > 0;
  const lowStock    = inStock && product.stock_qty <= 5;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        <Link
          href={`/tenant/${params.slug}/products`}
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          ← Back to Products
        </Link>
        {product.category && (
          <>
            <span className="mx-2">·</span>
            <Link
              href={`/tenant/${params.slug}/products?category=${encodeURIComponent(product.category)}`}
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
              {product.category}
            </Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        {/* Image — contain mode so full image is visible, like WooCommerce */}
        <div
          className="relative rounded-2xl overflow-hidden mx-auto w-full p-4"
          style={{
            aspectRatio: '1',
            background:   'var(--color-bg-secondary)',
            border:       '1px solid var(--color-border)',
            maxWidth:     '420px',
            maxHeight:    '420px',
          }}
        >
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 85vw, 420px"
              className="object-contain p-2"
              quality={85}
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">
              📦
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-5">
          {product.category && (
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-accent)' }}>
              {product.category}
            </p>
          )}

          <h1
            className="text-3xl font-bold leading-tight"
            style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
          >
            {product.name}
          </h1>

          {/* SKU */}
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            SKU: {product.sku}
          </p>

          {/* Price */}
          <p className="text-4xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
            {formatPrice(product.price_cents)}
          </p>

          {/* Stock status */}
          <p
            className="text-sm font-medium"
            style={{ color: inStock ? '#16a34a' : '#dc2626' }}
          >
            {!inStock && '✗ Out of Stock'}
            {inStock && !lowStock && `✓ In Stock (${product.stock_qty} available)`}
            {lowStock && `⚠ Low Stock — only ${product.stock_qty} left`}
          </p>

          {/* Description */}
          {product.description && (
            <p
              className="leading-relaxed text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {product.description}
            </p>
          )}

          {/* Add to Cart */}
          <div className="pt-2">
            <AddToCartButton
              productId={product.id}
              name={product.name}
              priceCents={product.price_cents}
              imageUrl={product.image_url}
              inStock={inStock}
            />
          </div>

          {/* View cart link (shown after adding) */}
          <Link
            href={`/tenant/${params.slug}/cart`}
            className="text-sm text-center"
            style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            View Cart →
          </Link>
        </div>
      </div>
    </div>
  );
}
