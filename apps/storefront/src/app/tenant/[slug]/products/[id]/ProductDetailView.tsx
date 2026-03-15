'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link  from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import type { Product, ProductVariant, ProductReview } from '@/lib/tenant-api';
import { AddToCartButton } from '@/components/AddToCartButton';
import { ProductGrid }     from '@/components/ProductGrid';
import { WholesaleProductDetail } from '@/components/WholesaleProductDetail';
import { WishlistButton } from '@/components/WishlistButton';

interface Props {
  slug: string;
  ssrProduct: Product;
  related: Product[];
  initialReviews?: ProductReview[];
  reviewTotal?: number;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Extract unique attribute names and their possible values from variants */
function getAttributeOptions(variants: ProductVariant[]): { name: string; values: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [key, val] of Object.entries(v.attributes)) {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(val);
    }
  }
  return Array.from(map.entries()).map(([name, vals]) => ({
    name,
    values: Array.from(vals),
  }));
}

/** Find the variant matching the current selections (all attributes must match) */
function findMatchingVariant(
  variants: ProductVariant[],
  selections: Record<string, string>,
): ProductVariant | null {
  const selectedKeys = Object.keys(selections).filter(k => selections[k]);
  if (selectedKeys.length === 0) return null;
  return variants.find(v =>
    selectedKeys.every(k => v.attributes[k] === selections[k])
  ) ?? null;
}

export function ProductDetailView({ slug, ssrProduct, related, initialReviews, reviewTotal }: Props) {
  return (
    <WholesaleProductDetail slug={slug} productId={ssrProduct.id} ssrProduct={ssrProduct}>
      {(product) => (
        <ProductDetailContent slug={slug} product={product} related={related} initialReviews={initialReviews} reviewTotal={reviewTotal} />
      )}
    </WholesaleProductDetail>
  );
}

function ProductDetailContent({ slug, product, related, initialReviews, reviewTotal }: { slug: string; product: Product; related: Product[]; initialReviews?: ProductReview[]; reviewTotal?: number }) {
  const variants = product.variants ?? [];
  const images = product.images ?? [];
  const isVariable = product.product_type === 'variable' && variants.length > 0;
  const attrOptions = useMemo(() => getAttributeOptions(variants), [variants]);

  // Image gallery state
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // Variant selection state
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    // Pre-select first value of each attribute
    const init: Record<string, string> = {};
    for (const opt of getAttributeOptions(variants)) {
      init[opt.name] = opt.values[0] ?? '';
    }
    return init;
  });

  const selectedVariant = useMemo(
    () => isVariable ? findMatchingVariant(variants, selections) : null,
    [isVariable, variants, selections],
  );

  // Resolve display values based on selected variant
  const resolvedStock = isVariable
    ? (selectedVariant?.stock ?? 0)
    : product.stock_qty;
  const inStock = resolvedStock > 0;
  const lowStock = inStock && resolvedStock <= 5;

  const resolvedImage = (isVariable && selectedVariant?.image_url) || product.image_url;

  // Price resolution: variant price > wholesale > sale > retail
  const hasEffectivePrice = product.effective_price_cents != null && product.effective_price_cents !== product.price_cents;
  const variantPrice = selectedVariant?.price_cents ?? null;
  let displayPrice: number;
  let onSale = false;

  if (variantPrice != null) {
    displayPrice = variantPrice;
    onSale = selectedVariant?.sale_price_cents != null && selectedVariant.sale_price_cents < variantPrice;
    if (onSale) displayPrice = selectedVariant!.sale_price_cents!;
  } else if (hasEffectivePrice) {
    displayPrice = product.effective_price_cents!;
  } else {
    onSale = product.sale_price_cents != null && product.sale_price_cents < product.price_cents;
    displayPrice = onSale ? product.sale_price_cents! : product.price_cents;
  }

  const basePrice = variantPrice ?? product.price_cents;
  const savePct = onSale ? Math.round((1 - displayPrice / basePrice) * 100) : 0;

  const variantLabel = isVariable
    ? Object.values(selections).filter(Boolean).join(' / ')
    : undefined;

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
        {/* Image Gallery */}
        <div className="flex flex-col gap-3 mx-auto w-full" style={{ maxWidth: '420px' }}>
          {/* Main image */}
          <div
            className="relative rounded-2xl overflow-hidden w-full p-4"
            style={{
              aspectRatio: '1',
              background:   'var(--color-bg-secondary)',
              border:       '1px solid var(--color-border)',
            }}
          >
            {(() => {
              const mainImage = images.length > 0
                ? images[activeImageIdx]?.url ?? resolvedImage
                : resolvedImage;
              const altText = images.length > 0
                ? images[activeImageIdx]?.alt_text || product.name
                : product.name;
              return mainImage ? (
                <Image
                  src={mainImage}
                  alt={altText}
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
              );
            })()}
            {onSale && (
              <span
                className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
              >
                {savePct > 0 ? `Save ${savePct}%` : 'Sale'}
              </span>
            )}
            {hasEffectivePrice && !variantPrice && (
              <span
                className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: '#7c3aed', color: '#fff' }}
              >
                Wholesale
              </span>
            )}

            {/* Prev/Next arrows (only when multiple images) */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImageIdx(i => (i - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  onClick={() => setActiveImageIdx(i => (i + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  aria-label="Next image"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImageIdx(idx)}
                  className="relative flex-shrink-0 rounded-lg overflow-hidden transition-all"
                  style={{
                    width: 56, height: 56,
                    border: idx === activeImageIdx
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    opacity: idx === activeImageIdx ? 1 : 0.7,
                    padding: 0,
                  }}
                  aria-label={img.alt_text || `Image ${idx + 1}`}
                >
                  <Image
                    src={img.url}
                    alt={img.alt_text || `${product.name} ${idx + 1}`}
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                  />
                </button>
              ))}
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

          <div className="flex items-start justify-between gap-2">
            <h1
              className="text-3xl font-bold leading-tight"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
            >
              {product.name}
            </h1>
            <WishlistButton slug={slug} productId={product.id} variantId={selectedVariant?.id} size={24} />
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            SKU: {selectedVariant?.sku || product.sku}
            {product.brand && <span className="ml-3">Brand: {product.brand}</span>}
          </p>

          {/* Average Rating */}
          {(product.review_count ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <StarRating rating={Number(product.avg_rating ?? 0)} />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                ({product.review_count} {product.review_count === 1 ? 'review' : 'reviews'})
              </span>
            </div>
          )}

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
                {formatPrice(basePrice)}
              </span>
            )}
          </div>

          {/* Variant Selectors */}
          {isVariable && attrOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              {attrOptions.map((attr) => (
                <div key={attr.name}>
                  <label
                    className="text-xs font-semibold uppercase tracking-wide mb-1.5 block"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {attr.name}: <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>{selections[attr.name]}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((val) => {
                      const isSelected = selections[attr.name] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => setSelections(prev => ({ ...prev, [attr.name]: val }))}
                          className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                          style={{
                            border: isSelected
                              ? '2px solid var(--color-primary)'
                              : '1px solid var(--color-border)',
                            background: isSelected ? 'var(--color-primary)' : 'var(--color-bg)',
                            color: isSelected ? 'var(--color-primary-fg)' : 'var(--color-text)',
                            cursor: 'pointer',
                          }}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stock status */}
          <p
            className="text-sm font-medium"
            style={{ color: inStock ? '#16a34a' : '#dc2626' }}
          >
            {!inStock && '✗ Out of Stock'}
            {inStock && !lowStock && `✓ In Stock (${resolvedStock} available)`}
            {lowStock && `⚠ Low Stock — only ${resolvedStock} left`}
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
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description) }}
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
              variantId={selectedVariant?.id}
              name={product.name}
              priceCents={displayPrice}
              imageUrl={resolvedImage}
              inStock={inStock}
              variantLabel={variantLabel}
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

      {/* Reviews Section */}
      <ReviewsSection
        slug={slug}
        productId={product.id}
        initialReviews={initialReviews ?? []}
        initialTotal={reviewTotal ?? 0}
      />

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
}

// ── Star Rating Display ─────────────────────────────────────────────────────
function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating >= star;
        const half = !filled && rating >= star - 0.5;
        return (
          <span key={star} style={{ fontSize: size, color: filled || half ? '#f59e0b' : '#d1d5db' }}>
            {filled ? '\u2605' : half ? '\u2605' : '\u2606'}
          </span>
        );
      })}
    </span>
  );
}

// ── Interactive Star Selector ───────────────────────────────────────────────
function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          style={{
            fontSize: 24,
            color: (hover || value) >= star ? '#f59e0b' : '#d1d5db',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          {'\u2605'}
        </button>
      ))}
    </span>
  );
}

// ── Reviews Section ─────────────────────────────────────────────────────────
function ReviewsSection({
  slug,
  productId,
  initialReviews,
  initialTotal,
}: {
  slug: string;
  productId: string;
  initialReviews: ProductReview[];
  initialTotal: number;
}) {
  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  const [total] = useState(initialTotal);
  const [showForm, setShowForm] = useState(false);

  // Review form state
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) { setError('Please select a rating'); return; }
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/storefront/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': slug },
        body: JSON.stringify({ rating, title: title || undefined, body: body || undefined, customer_name: customerName || 'Anonymous' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Failed to submit review');
        return;
      }
      setSubmitted(true);
      setShowForm(false);
      setRating(0);
      setTitle('');
      setBody('');
      setCustomerName('');
    } catch {
      setError('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-lg font-bold"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
        >
          Customer Reviews {total > 0 && `(${total})`}
        </h2>
        {!showForm && !submitted && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-primary-fg)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Write a Review
          </button>
        )}
      </div>

      {submitted && (
        <div className="mb-6 p-4 rounded-lg" style={{ background: '#dcfce7', color: '#166534' }}>
          Thank you! Your review has been submitted and will appear after moderation.
        </div>
      )}

      {/* Review Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 p-5 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Rating *</label>
            <StarSelector value={rating} onChange={setRating} />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Your Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Anonymous"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summary of your review"
              maxLength={255}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Review</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
              maxLength={5000}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical' }}
            />
          </div>

          {error && <p className="text-sm mb-3" style={{ color: '#dc2626' }}>{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-5 py-2 rounded-lg text-sm"
              style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reviews List */}
      {reviews.length > 0 ? (
        <div className="flex flex-col gap-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="p-4 rounded-xl"
              style={{ border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <StarRating rating={review.rating} size={14} />
                {review.title && (
                  <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                    {review.title}
                  </span>
                )}
              </div>
              {review.body && (
                <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  {review.body}
                </p>
              )}
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                By {review.customer_name} on {new Date(review.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : !submitted && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No reviews yet. Be the first to review this product!
        </p>
      )}
    </section>
  );
}
