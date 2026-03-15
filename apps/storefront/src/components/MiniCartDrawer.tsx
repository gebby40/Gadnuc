'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from './CartProvider';

interface Props {
  slug: string;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function MiniCartDrawer({ slug }: Props) {
  const { items, totalItems, totalCents, updateQty, removeItem, drawerOpen, closeDrawer } = useCart();
  const base = `/tenant/${slug}`;

  // Lock body scroll when open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Close on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer();
    }
    if (drawerOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className="fixed inset-0 z-[60] transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.4)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
        }}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 z-[70] h-full w-full max-w-sm flex flex-col transition-transform duration-300 ease-out"
        style={{
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          pointerEvents: drawerOpen ? 'auto' : 'none',
          background: 'var(--color-bg)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            Cart ({totalItems})
          </h2>
          <button
            onClick={closeDrawer}
            className="p-1 hover:opacity-60 transition-opacity"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}
            aria-label="Close cart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-center text-sm py-12" style={{ color: 'var(--color-text-muted)' }}>
              Your cart is empty
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-3"
                  style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative flex-shrink-0 rounded-lg overflow-hidden"
                    style={{
                      width: 64, height: 64,
                      background: 'var(--color-bg-secondary)',
                    }}
                  >
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium line-clamp-2 mb-1"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {item.name}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {formatPrice(item.priceCents)}
                    </p>

                    {/* Qty controls */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => updateQty(item.productId, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-xs"
                        style={{
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-bg-secondary)',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                        }}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span className="text-sm font-medium w-5 text-center" style={{ color: 'var(--color-text)' }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.productId, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-xs"
                        style={{
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-bg-secondary)',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                        }}
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="ml-auto text-xs hover:opacity-60 transition-opacity"
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                        aria-label="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div
            className="px-5 py-4 flex flex-col gap-3"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <div className="flex justify-between text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              <span>Subtotal</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <Link
              href={`${base}/cart`}
              onClick={closeDrawer}
              className="block text-center py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                textDecoration: 'none',
              }}
            >
              View Cart
            </Link>
            <Link
              href={`${base}/checkout`}
              onClick={closeDrawer}
              className="block text-center py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-primary-fg)',
                textDecoration: 'none',
              }}
            >
              Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
