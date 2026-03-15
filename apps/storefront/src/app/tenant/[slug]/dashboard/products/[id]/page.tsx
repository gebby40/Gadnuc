'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPatch, tenantPost, tenantDelete } from '../../../../../../lib/api';

interface ProductImageItem {
  id: string;
  url: string;
  alt_text: string;
  position: number;
  is_primary: boolean;
  variant_id: string | null;
}

interface Variant {
  id: string;
  sku: string | null;
  price_cents: number | null;
  sale_price_cents: number | null;
  stock: number;
  attributes: Record<string, string>;
  image_url: string | null;
  is_active: boolean;
  position: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  wholesale_price_cents: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
  wholesale_only: boolean;
  metadata: Record<string, unknown>;
  product_type?: 'simple' | 'variable';
  variants?: Variant[];
  images?: ProductImageItem[];
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const productId = params.id as string;
  const { user, token } = useAuth();

  const [form, setForm] = useState({
    sku: '', name: '', description: '', category: '',
    price: '', wholesale_price: '', stock_qty: '0', low_stock_threshold: '10',
    image_url: '', is_active: true, wholesale_only: false, metadata: '{}',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantSaving, setVariantSaving] = useState(false);
  const [productImages, setProductImages] = useState<ProductImageItem[]>([]);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await tenantGet<{ data: Product }>(slug, token, `/api/products/${productId}`);
        const p = res.data;
        setForm({
          sku: p.sku,
          name: p.name,
          description: p.description ?? '',
          category: p.category ?? '',
          price: (p.price_cents / 100).toFixed(2),
          wholesale_price: p.wholesale_price_cents != null ? (p.wholesale_price_cents / 100).toFixed(2) : '',
          stock_qty: String(p.stock_qty),
          low_stock_threshold: String(p.low_stock_threshold),
          image_url: p.image_url ?? '',
          is_active: p.is_active,
          wholesale_only: p.wholesale_only ?? false,
          metadata: JSON.stringify(p.metadata ?? {}, null, 2),
        });
        if (p.variants) setVariants(p.variants);
        if (p.images) setProductImages(p.images);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load product');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, token, productId]);

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

      const wholesaleCents = form.wholesale_price.trim()
        ? Math.round(parseFloat(form.wholesale_price) * 100)
        : null;

      await tenantPatch(slug, token!, `/api/products/${productId}`, {
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        category: form.category || undefined,
        price_cents: priceCents,
        wholesale_price_cents: wholesaleCents,
        stock_qty: parseInt(form.stock_qty) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
        wholesale_only: form.wholesale_only,
        metadata,
      });

      router.push(`/tenant/${slug}/dashboard/products`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to update product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await tenantDelete(slug, token!, `/api/products/${productId}`);
      router.push(`/tenant/${slug}/dashboard/products`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete product');
      setShowDeleteConfirm(false);
    }
  }

  async function handleGalleryUpload(file: File) {
    if (!token) return;
    setImageUploading(true);
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
      await tenantPost(slug, token, '/api/uploads/confirm', { key: presignRes.key });

      // Create product_images record
      const res = await tenantPost<{ data: ProductImageItem }>(slug, token, `/api/products/${productId}/images`, {
        url: presignRes.publicUrl,
        cdn_key: presignRes.key,
        alt_text: '',
        position: productImages.length,
        is_primary: productImages.length === 0,
      });
      setProductImages(prev => [...prev, res.data]);
      // If first image, also update the form's image_url for backwards compat
      if (productImages.length === 0) {
        update('image_url', presignRes.publicUrl);
      }
    } catch (err: any) {
      setError(err.message ?? 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  }

  async function deleteProductImage(imageId: string) {
    if (!token) return;
    try {
      await tenantDelete(slug, token, `/api/products/${productId}/images/${imageId}`);
      setProductImages(prev => prev.filter(img => img.id !== imageId));
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete image');
    }
  }

  async function setPrimaryImage(imageId: string) {
    if (!token) return;
    try {
      await tenantPatch(slug, token, `/api/products/${productId}/images/${imageId}`, { is_primary: true });
      setProductImages(prev =>
        prev.map(img => ({ ...img, is_primary: img.id === imageId }))
      );
      // Update form image_url to the new primary
      const img = productImages.find(i => i.id === imageId);
      if (img) update('image_url', img.url);
    } catch (err: any) {
      setError(err.message ?? 'Failed to set primary image');
    }
  }

  async function addVariant() {
    if (!token) return;
    setVariantSaving(true);
    try {
      const res = await tenantPost<{ data: Variant }>(slug, token, `/api/products/${productId}/variants`, {
        sku: null, price_cents: null, stock: 0, attributes: {}, is_active: true, position: variants.length,
      });
      setVariants(prev => [...prev, res.data]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to add variant');
    } finally {
      setVariantSaving(false);
    }
  }

  async function updateVariant(variantId: string, updates: Partial<Variant>) {
    if (!token) return;
    try {
      const payload: Record<string, unknown> = {};
      if (updates.sku !== undefined) payload.sku = updates.sku;
      if (updates.price_cents !== undefined) payload.price_cents = updates.price_cents;
      if (updates.stock !== undefined) payload.stock = updates.stock;
      if (updates.attributes !== undefined) payload.attributes = updates.attributes;
      if (updates.image_url !== undefined) payload.image_url = updates.image_url;
      if (updates.is_active !== undefined) payload.is_active = updates.is_active;
      const res = await tenantPatch<{ data: Variant }>(slug, token, `/api/products/${productId}/variants/${variantId}`, payload);
      setVariants(prev => prev.map(v => v.id === variantId ? res.data : v));
    } catch (err: any) {
      setError(err.message ?? 'Failed to update variant');
    }
  }

  async function deleteVariant(variantId: string) {
    if (!token) return;
    try {
      await tenantDelete(slug, token, `/api/products/${productId}/variants/${variantId}`);
      setVariants(prev => prev.filter(v => v.id !== variantId));
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete variant');
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading product...</div>;
  }

  const canDelete = user?.role === 'tenant_admin';

  return (
    <div style={{ padding: '2rem', maxWidth: '700px' }}>
      <button
        onClick={() => router.push(`/tenant/${slug}/dashboard/products`)}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem' }}
      >
        ← Back to products
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Edit Product</h1>
        {canDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ padding: '0.4rem 0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Delete Product
          </button>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
          padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 500 }}>
            Are you sure? This cannot be undone.
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '0.35rem 0.75rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleDelete} style={{ padding: '0.35rem 0.75rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              Yes, Delete
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={cardStyle}>
          {/* SKU + Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>SKU *</label>
              <input value={form.sku} onChange={e => update('sku', e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={form.name} onChange={e => update('name', e.target.value)} required style={inputStyle} />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Category + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Category</label>
              <input value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Price (USD) *</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => update('price', e.target.value)} required style={inputStyle} />
            </div>
          </div>

          {/* Wholesale Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Wholesale Price (USD)</label>
              <input type="number" step="0.01" min="0" value={form.wholesale_price} onChange={e => update('wholesale_price', e.target.value)} style={inputStyle} placeholder="Leave blank for no wholesale price" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="wholesale_only" checked={form.wholesale_only} onChange={e => update('wholesale_only', e.target.checked)} />
                <label htmlFor="wholesale_only" style={{ fontSize: '0.85rem', color: '#374151' }}>Wholesale only (hidden from retail)</label>
              </div>
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

          {/* Image Gallery */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Product Images</label>

            {/* Existing images grid */}
            {productImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {productImages.map((img) => (
                  <div
                    key={img.id}
                    style={{
                      position: 'relative', width: '80px', height: '80px',
                      borderRadius: '8px', overflow: 'hidden',
                      border: img.is_primary ? '2px solid #0f172a' : '1px solid #e2e8f0',
                    }}
                  >
                    <img src={img.url} alt={img.alt_text || 'Product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {img.is_primary && (
                      <span style={{
                        position: 'absolute', top: 2, left: 2, background: '#0f172a', color: '#fff',
                        fontSize: '0.55rem', fontWeight: 700, padding: '1px 4px', borderRadius: '4px',
                      }}>
                        Primary
                      </span>
                    )}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      display: 'flex', justifyContent: 'space-between',
                      background: 'rgba(0,0,0,0.55)', padding: '2px 4px',
                    }}>
                      {!img.is_primary && (
                        <button
                          type="button"
                          onClick={() => setPrimaryImage(img.id)}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.6rem', padding: 0 }}
                          title="Set as primary"
                        >
                          Star
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteProductImage(img.id)}
                        style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.6rem', padding: 0, marginLeft: 'auto' }}
                        title="Delete image"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            <label style={{
              display: 'block', padding: '1rem', border: '2px dashed #d1d5db', borderRadius: '8px',
              textAlign: 'center', cursor: imageUploading ? 'wait' : 'pointer', color: '#94a3b8', fontSize: '0.85rem',
            }}>
              {imageUploading ? 'Uploading...' : '+ Add Image'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) handleGalleryUpload(f); }}
              />
            </label>

            {/* Legacy single image URL (hidden if gallery has images) */}
            {productImages.length === 0 && form.image_url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                <img src={form.image_url} alt="Preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <button type="button" onClick={() => update('image_url', '')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Remove
                </button>
              </div>
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

        {/* Variants Section */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Variants {variants.length > 0 && <span style={{ color: '#64748b', fontWeight: 400 }}>({variants.length})</span>}
            </h2>
            <button
              type="button"
              onClick={addVariant}
              disabled={variantSaving}
              style={{
                padding: '0.35rem 0.75rem', background: '#f0fdf4', color: '#16a34a',
                border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.8rem',
                fontWeight: 600, cursor: variantSaving ? 'wait' : 'pointer',
              }}
            >
              {variantSaving ? 'Adding...' : '+ Add Variant'}
            </button>
          </div>

          {variants.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
              No variants. This is a simple product. Add variants to offer size, color, or other options.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {variants.map((v, idx) => (
                <div
                  key={v.id}
                  style={{
                    border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem',
                    background: v.is_active ? '#fff' : '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Variant #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => deleteVariant(v.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Delete
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '0.7rem' }}>SKU</label>
                      <input
                        value={v.sku ?? ''}
                        onChange={e => updateVariant(v.id, { sku: e.target.value || null })}
                        style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                        placeholder="Variant SKU"
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Price (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.price_cents != null ? (v.price_cents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = e.target.value.trim();
                          updateVariant(v.id, { price_cents: val ? Math.round(parseFloat(val) * 100) : null });
                        }}
                        style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                        placeholder="Use parent"
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Stock</label>
                      <input
                        type="number"
                        min="0"
                        value={v.stock}
                        onChange={e => updateVariant(v.id, { stock: parseInt(e.target.value) || 0 })}
                        style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                      />
                    </div>
                  </div>

                  {/* Attributes as key-value pairs */}
                  <div>
                    <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Attributes (e.g. Color: Red, Size: Large)</label>
                    <input
                      value={Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ')}
                      onChange={e => {
                        const pairs: Record<string, string> = {};
                        e.target.value.split(',').forEach(pair => {
                          const [key, ...rest] = pair.split(':');
                          if (key?.trim() && rest.join(':').trim()) {
                            pairs[key.trim()] = rest.join(':').trim();
                          }
                        });
                        updateVariant(v.id, { attributes: pairs });
                      }}
                      style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                      placeholder="Color: Red, Size: Large"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {saving ? 'Saving...' : 'Save Changes'}
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
