'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantPost, tenantFetch } from '../../../../../../lib/api';

export default function AddProductPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [form, setForm] = useState({
    sku: '', name: '', description: '', category: '',
    price: '', stock_qty: '0', low_stock_threshold: '10',
    image_url: '', is_active: true, metadata: '{}',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function update(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleImageUpload(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const presignRes = await tenantPost<{ uploadUrl: string; publicUrl: string; key: string }>(
        slug, token, '/api/uploads/presign', {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }
      );

      await fetch(presignRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      // Confirm upload & set public-read ACL (DO Spaces ignores ACL in presigned URLs)
      await tenantPost(slug, token, '/api/uploads/confirm', { key: presignRes.key });

      update('image_url', presignRes.publicUrl);
    } catch (err: any) {
      setError(err.message ?? 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const priceCents = Math.round(parseFloat(form.price) * 100);
      if (isNaN(priceCents) || priceCents < 0) {
        setError('Invalid price');
        setSaving(false);
        return;
      }

      let metadata = {};
      try {
        metadata = form.metadata.trim() ? JSON.parse(form.metadata) : {};
      } catch {
        setError('Invalid metadata JSON');
        setSaving(false);
        return;
      }

      await tenantPost(slug, token!, '/api/products', {
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        category: form.category || undefined,
        price_cents: priceCents,
        stock_qty: parseInt(form.stock_qty) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
        metadata,
      });

      router.push(`/tenant/${slug}/dashboard/products`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '700px' }}>
      <button
        onClick={() => router.push(`/tenant/${slug}/dashboard/products`)}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem' }}
      >
        ← Back to products
      </button>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem' }}>Add Product</h1>

      <form onSubmit={handleSubmit}>
        <div style={cardStyle}>
          {/* SKU + Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>SKU *</label>
              <input value={form.sku} onChange={e => update('sku', e.target.value)} required style={inputStyle} placeholder="PROD-001" />
            </div>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={form.name} onChange={e => update('name', e.target.value)} required style={inputStyle} placeholder="Product name" />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Product description..." />
          </div>

          {/* Category + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Category</label>
              <input value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle} placeholder="e.g. Electronics" />
            </div>
            <div>
              <label style={labelStyle}>Price (USD) *</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => update('price', e.target.value)} required style={inputStyle} placeholder="0.00" />
            </div>
          </div>

          {/* Stock + Threshold */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Stock Quantity</label>
              <input type="number" min="0" value={form.stock_qty} onChange={e => update('stock_qty', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Low Stock Threshold</label>
              <input type="number" min="0" value={form.low_stock_threshold} onChange={e => update('low_stock_threshold', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Image upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Product Image</label>
            {form.image_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img src={form.image_url} alt="Preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <button type="button" onClick={() => update('image_url', '')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Remove
                </button>
              </div>
            ) : (
              <label style={{
                display: 'block', padding: '1.5rem', border: '2px dashed #d1d5db', borderRadius: '8px',
                textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', color: '#94a3b8', fontSize: '0.85rem',
              }}>
                {uploading ? 'Uploading...' : 'Click to upload image (JPEG, PNG, WebP)'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                />
              </label>
            )}
          </div>

          {/* Active toggle */}
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => update('is_active', e.target.checked)} />
            <label htmlFor="is_active" style={{ fontSize: '0.85rem', color: '#374151' }}>Active (visible in storefront)</label>
          </div>

          {/* Metadata */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Metadata (JSON)</label>
            <textarea value={form.metadata} onChange={e => update('metadata', e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem' }} />
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" disabled={saving} style={{
            padding: '0.6rem 1.5rem', background: saving ? '#94a3b8' : '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving...' : 'Create Product'}
          </button>
          <button type="button" onClick={() => router.push(`/tenant/${slug}/dashboard/products`)} style={{
            padding: '0.6rem 1.5rem', background: '#fff', color: '#374151',
            border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};
