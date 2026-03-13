'use client';

import Image from 'next/image';
import Link  from 'next/link';
import type { Product } from '@/lib/tenant-api';
import { AddToCartButton } from '@/components/AddToCartButton';
import { ProductGrid }     from '@/components/ProductGrid';
import { WholesaleProductDetail } from '@/components/WholesaleProductDetail';

interface Props {
  slug: string;
  ssrProduct: Product;
  related: Product[];
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ProductDetailView({ slug, ssrProduct, related }: Props) {
  return (
    <WholesaleProductDetail slug={slug} productId={ssrProduct.id} ssrProduct={ssrProduct}>
      {(product) => {
        const inStock     = product.stock_qty > 0;
        const lowStock    = inStock && product.stock_qty <= 5;

        // Use effective_price_cents if available (wholesale), else check sale, else retail
        const hasEffectivePrice = product.effective_price_cents != null && product.effective_price_cents !== product.price_cents;
        const onSale      = !hasEffectivePrice && product.sale_price_cents != null && product.sale_price_cents < product.price_cents;
        const displayPrice = hasEffectivePrice
          ? product.effective_price_cents!
          : onSale ? product.sale_price_cents! : product.price_cents;
        const savePct     = onSale ? Math.round((1 - product.sale_price_cents! / product.price_cents) * 100) : 0;

        // Build attributes list from metadata + product fields
        const attributes: { label: string; value: string }[] = [];
        if (product.brand) attributes.push({ label: 'Brand', value: product.brand });
        if (product.weight_oz) attributes.push({ label: 'Weight', value: `${product.weight_oz} oz` });
        if (product.length_in || product.width_in || product.height_in) {
          const dims = [product.length_in, product.width_in, product.height_in]
            .filter(Boolean)
            .map((d) => `${d}"`)
            .join(' × ');
          if (dims) attributes.push({ label: 'Dimensions', value: dims });
        }
        if (product.shipping_class && product.shipping_class !== 'standard') {
          attributes.push({ label: 'Shipping', value: product.shipping_class });
        }
        for (const [key, val] of Object.entries(product.metadata)) {
          if (val != null && val !== '') {
            attributes.push({
              label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              value: String(val),
            });
          }
        }

        return (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            {/* Breadcrumb */}
            <nav className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
              <Link
                href={`/tenant/${slug}/products`}
                style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
              >
                ← Back to Products
              </Link>
              {product.category && (
                <>
                  <span className="mx-2">·</span>
                  <Link
                    href={`/tenant/${slug}/products?category=${encodeURIComponent(product.category)}`}
                    style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
                  >
                    {product.category}
                  </Link>
                </>
              )}
            </nav>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              {/* Image */}
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
                {onSale && (
                  <span
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
                  >
                    {savePct > 0 ? `Save ${savePct}%` : 'Sale'}
                  </span>
                )}
                {hasEffectivePrice && (
                  <span
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: '#7c3aed', color: '#fff' }}
                  >
                    Wholesale
                  </span>
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

                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  SKU: {product.sku}
                  {product.brand && <span className="ml-3">Brand: {product.brand}</span>}
                </p>

                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
                    {formatPrice(displayPrice)}
                  </span>
                  {onSale && (
                    <span
                      className="text-xl line-through"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {formatPrice(product.price_cents)}
                    </span>
                  )}
                </div>

                {/* Stock status */}
                <p
                  className="text-sm font-medium"
                  style={{ color: inStock ? '#16a34a' : '#dc2626' }}
                >
                  {!inStock && '✗ Out of Stock'}
                  {inStock && !lowStock && `✓ In Stock (${product.stock_qty} available)`}
                  {lowStock && `⚠ Low Stock — only ${product.stock_qty} left`}
                </p>

                {/* Tags */}
                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{
                          background: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {product.description && (
                  product.description.includes('<') ? (
                    <div
                      className="leading-relaxed text-sm prose prose-sm max-w-none"
                      style={{ color: 'var(--color-text-muted)' }}
                      dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                  ) : (
                    <p
                      className="leading-relaxed text-sm"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {product.description}
                    </p>
                  )
                )}

                {/* Add to Cart */}
                <div className="pt-2">
                  <AddToCartButton
                    productId={product.id}
                    name={product.name}
                    priceCents={displayPrice}
                    imageUrl={product.image_url}
                    inStock={inStock}
                  />
                </div>

                <Link
                  href={`/tenant/${slug}/cart`}
                  className="text-sm text-center"
                  style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
                >
                  View Cart →
                </Link>
              </div>
            </div>

            {/* Product Attributes */}
            {attributes.length > 0 && (
              <section className="mt-12">
                <h2
                  className="text-lg font-bold mb-4"
                  style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
                >
                  Additional Information
                </h2>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <table className="w-full text-sm">
                    <tbody>
                      {attributes.map((attr, i) => (
                        <tr
                          key={attr.label}
                          style={{
                            background: i % 2 === 0 ? 'var(--color-bg-secondary)' : 'transparent',
                          }}
                        >
                          <td
                            className="px-4 py-2.5 font-medium"
                            style={{ color: 'var(--color-text)', width: '35%' }}
                          >
                            {attr.label}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--color-text-muted)' }}>
                            {attr.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Related Products */}
            {related.length > 0 && (
              <section className="mt-12">
                <h2
                  className="text-lg font-bold mb-6"
                  style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
                >
                  Related Products
                </h2>
                <ProductGrid products={related} tenantSlug={slug} />
              </section>
            )}
          </div>
        );
      }}
    </WholesaleProductDetail>
  );
}
