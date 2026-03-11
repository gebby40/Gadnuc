'use client';

import { useState } from 'react';
import { useCart } from './CartProvider';

interface Props {
  productId:   string;
  name:        string;
  priceCents:  number;
  imageUrl:    string | null;
  inStock:     boolean;
}

export function AddToCartButton({ productId, name, priceCents, imageUrl, inStock }: Props) {
  const { addItem } = useCart();
  const [added, setAdded]   = useState(false);
  const [qty, setQty]       = useState(1);

  function handleAdd() {
    if (!inStock) return;
    addItem({ productId, name, priceCents, imageUrl, quantity: qty });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (!inStock) {
    return (
      <button
        disabled
        className="w-full rounded-lg px-6 py-3 font-semibold text-sm bg-gray-200 text-gray-500 cursor-not-allowed"
      >
        Out of Stock
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Quantity selector */}
      <div className="flex items-center border border-[var(--color-border)] rounded-lg overflow-hidden">
        <button
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="px-3 py-2 text-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          aria-label="Decrease quantity"
        >
          −
        </button>
        <span className="px-4 py-2 font-medium text-sm select-none">{qty}</span>
        <button
          onClick={() => setQty((q) => Math.min(99, q + 1))}
          className="px-3 py-2 text-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      {/* Add to cart */}
      <button
        onClick={handleAdd}
        className="flex-1 rounded-lg px-6 py-3 font-semibold text-sm transition-all duration-200"
        style={{
          backgroundColor: added ? 'var(--color-accent)' : 'var(--color-primary)',
          color: 'var(--color-primary-fg)',
        }}
      >
        {added ? '✓ Added!' : 'Add to Cart'}
      </button>
    </div>
  );
}
