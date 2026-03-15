'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPatch, tenantDelete } from '../../../../../../lib/api';

interface Review {
  id: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function ReviewModerationPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<string>('pending');
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const res = await tenantGet<{ data: Review[] }>(slug, token, `/api/products/reviews${qs}`);
      setReviews(res.data ?? []);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token, filter]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  async function moderate(reviewId: string, status: 'approved' | 'rejected') {
    try {
      await tenantPatch(slug, token!, `/api/products/reviews/${reviewId}`, { status });
      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, status } : r));
    } catch (err) {
      console.error('Moderate failed:', err);
    }
  }

  async function deleteReview(reviewId: string) {
    if (!confirm('Delete this review permanently?')) return;
    try {
      await tenantDelete(slug, token!, `/api/products/reviews/${reviewId}`);
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  const stars = (n: number) => '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Review Moderation</h1>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['pending', 'approved', 'rejected', ''].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 8,
              border: filter === f ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: filter === f ? '#eff6ff' : '#fff',
              color: filter === f ? '#1d4ed8' : '#374151',
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : reviews.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No reviews found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {reviews.map((r) => (
            <div
              key={r.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                background: r.status === 'pending' ? '#fffbeb' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ color: '#f59e0b', fontSize: '1rem', letterSpacing: 2 }}>{stars(r.rating)}</span>
                  {r.title && (
                    <span style={{ fontWeight: 600, marginLeft: '0.75rem', fontSize: '0.9rem' }}>{r.title}</span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: r.status === 'approved' ? '#dcfce7' : r.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                    color: r.status === 'approved' ? '#166534' : r.status === 'rejected' ? '#991b1b' : '#92400e',
                  }}
                >
                  {r.status}
                </span>
              </div>

              {r.body && (
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.5rem' }}>{r.body}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  By <strong>{r.customer_name}</strong> on {new Date(r.created_at).toLocaleDateString()}
                  {' · '}Product: {r.product_name}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {r.status !== 'approved' && (
                    <button
                      onClick={() => moderate(r.id, 'approved')}
                      style={{
                        padding: '4px 12px', borderRadius: 6,
                        background: '#16a34a', color: '#fff', border: 'none',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      onClick={() => moderate(r.id, 'rejected')}
                      style={{
                        padding: '4px 12px', borderRadius: 6,
                        background: '#dc2626', color: '#fff', border: 'none',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => deleteReview(r.id)}
                    style={{
                      padding: '4px 12px', borderRadius: 6,
                      background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db',
                      fontSize: '0.75rem', cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
