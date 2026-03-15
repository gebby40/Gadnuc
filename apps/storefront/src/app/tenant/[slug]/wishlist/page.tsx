'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../../../components/AuthProvider';
import type { WishlistItem } from '@/lib/tenant-api';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function WishlistPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token, user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch('/api/storefront/wishlist', {
        headers: { 'x-tenant-slug': slug, 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.data ?? []);
      }
    } catch (err) {
      console.error('Failed to load wishlist:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

  async function removeItem(productId: string) {
    try {
      await fetch(`/api/storefront/wishlist/${productId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-slug': slug, 'Authorization': `Bearer ${token}` },
      });
      setItems((prev) => prev.filter((i) => i.product_id !== productId));
    } catch (err) {
      console.error('Remove failed:', err);
    }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 600, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-text)' }}>Wishlist</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Please{' '}
          <Link href={`/tenant/${slug}/login`} style={{ color: 'var(--color-primary)' }}>sign in</Link>
          {' '}to view your wishlist.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--color-text)' }}>
        My Wishlist
      </h1>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Your wishlist is empty.
          </p>
          <Link
            href={`/tenant/${slug}/products`}
            style={{
              display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 8,
              background: 'var(--color-primary)', color: 'var(--color-primary-fg)',
              textDecoration: 'none', fontWeight: 600,
            }}
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem',
              }}
            >
              {/* Image */}
              <div style={{ width: 80, height: 80, flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-secondary)' }}>
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.name} fill sizes="80px" style={{ objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                    📦
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/tenant/${slug}/products/${item.product_id}`}
                  style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.95rem' }}
                >
                  {item.name}
                </Link>
                <div style={{ marginTop: 4 }}>
                  {item.sale_price_cents != null && item.sale_price_cents < item.price_cents ? (
                    <span>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatPrice(item.sale_price_cents)}</span>
                      <span style={{ textDecoration: 'line-through', color: 'var(--color-text-muted)', marginLeft: 8, fontSize: '0.85rem' }}>{formatPrice(item.price_cents)}</span>
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatPrice(item.price_cents)}</span>
                  )}
                </div>
                <p style={{ fontSize: '0.75rem', color: item.stock_qty > 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>
                  {item.stock_qty > 0 ? 'In Stock' : 'Out of Stock'}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => removeItem(item.product_id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: '0.75rem',
                    background: '#fee2e2', color: '#dc2626', border: 'none',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
