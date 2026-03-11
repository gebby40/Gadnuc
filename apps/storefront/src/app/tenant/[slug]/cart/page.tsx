'use client';

import { useState } from 'react';
import Link          from 'next/link';
import Image         from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCart }   from '@/components/CartProvider';
import { createCheckoutSession } from '@/lib/tenant-api';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function CartPage() {
  const { slug }                     = useParams<{ slug: string }>();
  const { items, totalCents, totalItems, updateQty, removeItem, clearCart } = useCart();
  const router                       = useRouter();
  const [loading, setLoading]        = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const [email, setEmail]            = useState('');

  async function handleCheckout() {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const origin     = window.location.origin;
      const successUrl = `${origin}/tenant/${slug}/checkout/success`;
      const cancelUrl  = `${origin}/tenant/${slug}/cart`;

      const { url } = await createCheckoutSession(
        slug,
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        successUrl,
        cancelUrl,
        email || undefined,
      );

      // Clear cart before redirect (Stripe handles the session)
      clearCart();
      router.push(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-6">🛒</div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>
          Your cart is empty
        </h1>
        <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Looks like you haven&apos;t added anything yet.
        </p>
        <Link
          href={`/tenant/${slug}/products`}
          className="inline-block px-8 py-3 rounded-lg font-semibold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', textDecoration: 'none' }}
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
        Your Cart ({totalItems} {totalItems === 1 ? 'item' : 'items'})
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex gap-4 p-4 rounded-xl"
              style={{
                border:     '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              {/* Image */}
              <div
                className="relative flex-shrink-0 rounded-lg overflow-hidden"
                style={{ width: 80, height: 80, background: 'var(--color-bg-secondary)' }}
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                  {item.name}
                </h3>
                <p className="text-sm font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
                  {formatPrice(item.priceCents)}
                </p>

                {/* Qty controls */}
                <div className="flex items-center gap-2 mt-2">
                  <div
                    className="flex items-center rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    <button
                      onClick={() => updateQty(item.productId, item.quantity - 1)}
                      className="px-2.5 py-1 text-sm hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--color-text)' }}
                    >
                      −
                    </button>
                    <span className="px-3 py-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.productId, item.quantity + 1)}
                      className="px-2.5 py-1 text-sm hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--color-text)' }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Subtotal */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                  {formatPrice(item.priceCents * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div
          className="p-6 rounded-xl h-fit"
          style={{
            border:     '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--color-text)' }}>
            Order Summary
          </h2>

          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <div key={item.productId} className="flex justify-between text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <span className="truncate mr-2">{item.name} × {item.quantity}</span>
                <span className="flex-shrink-0">{formatPrice(item.priceCents * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div
            className="flex justify-between font-bold text-lg py-3 mb-5"
            style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            <span>Total</span>
            <span>{formatPrice(totalCents)}</span>
          </div>

          {/* Email (optional) */}
          <input
            type="email"
            placeholder="Email for receipt (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none"
            style={{
              border:     '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color:      'var(--color-text)',
            }}
          />

          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
          >
            {loading ? 'Redirecting to Checkout…' : 'Checkout →'}
          </button>

          <Link
            href={`/tenant/${slug}/products`}
            className="block text-center text-sm mt-3"
            style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            ← Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
