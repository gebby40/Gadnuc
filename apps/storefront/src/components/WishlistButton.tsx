'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';

interface Props {
  slug: string;
  productId: string;
  variantId?: string;
  initialWishlisted?: boolean;
  size?: number;
}

export function WishlistButton({ slug, productId, variantId, initialWishlisted = false, size = 20 }: Props) {
  const { token } = useAuth();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!token) return;
    setLoading(true);
    try {
      if (wishlisted) {
        await fetch(`/api/storefront/wishlist/${productId}`, {
          method: 'DELETE',
          headers: { 'x-tenant-slug': slug, 'Authorization': `Bearer ${token}` },
        });
        setWishlisted(false);
      } else {
        await fetch('/api/storefront/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': slug, 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ productId, variantId }),
        });
        setWishlisted(true);
      }
    } catch (err) {
      console.error('Wishlist toggle failed:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      disabled={loading}
      aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      style={{
        background: 'none',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        padding: 4,
        fontSize: size,
        color: wishlisted ? '#ef4444' : '#9ca3af',
        transition: 'color 0.15s, transform 0.15s',
        transform: loading ? 'scale(0.9)' : 'scale(1)',
        lineHeight: 1,
      }}
    >
      {wishlisted ? '\u2764' : '\u2661'}
    </button>
  );
}
