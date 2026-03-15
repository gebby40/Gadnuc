'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPost, tenantPatch, tenantDelete } from '../../../../../../lib/api';

interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  min_order_cents: number;
  max_uses: number | null;
  uses_count: number;
  per_customer_limit: number | null;
  applies_to: 'all' | 'categories' | 'products';
  product_ids: string[];
  category_names: string[];
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const typeLabels: Record<string, string> = {
  percentage: '% Off',
  fixed: '$ Off',
  free_shipping: 'Free Shipping',
};

export default function CouponsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: '', type: 'percentage' as Coupon['type'], value: '',
    min_order: '', max_uses: '', per_customer_limit: '',
    starts_at: '', expires_at: '', is_active: true,
  });

  const fetchCoupons = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: Coupon[] }>(slug, token, '/api/products/coupons');
      setCoupons(res.data);
    } catch {
      setError('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  function resetForm() {
    setForm({ code: '', type: 'percentage', value: '', min_order: '', max_uses: '', per_customer_limit: '', starts_at: '', expires_at: '', is_active: true });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function editCoupon(c: Coupon) {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order: c.min_order_cents ? (c.min_order_cents / 100).toFixed(2) : '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      per_customer_limit: c.per_customer_limit != null ? String(c.per_customer_limit) : '',
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : '',
      is_active: c.is_active,
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        code: form.code.trim(),
        type: form.type,
        value: parseFloat(form.value) || 0,
        min_order_cents: form.min_order ? Math.round(parseFloat(form.min_order) * 100) : 0,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        per_customer_limit: form.per_customer_limit ? parseInt(form.per_customer_limit) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      };

      if (editingId) {
        await tenantPatch(slug, token!, `/api/products/coupons/${editingId}`, body);
      } else {
        await tenantPost(slug, token!, '/api/products/coupons', body);
      }
      resetForm();
      fetchCoupons();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Delete this coupon?')) return;
    try {
      await tenantDelete(slug, token!, `/api/products/coupons/${id}`);
      setCoupons(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete');
    }
  }

  async function toggleActive(c: Coupon) {
    try {
      await tenantPatch(slug, token!, `/api/products/coupons/${c.id}`, { is_active: !c.is_active });
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
    } catch (err: any) {
      setError(err.message ?? 'Failed to update');
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Coupon Codes</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{
            padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + New Coupon
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
            {editingId ? 'Edit Coupon' : 'New Coupon'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Code *</label>
              <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} required style={inputStyle} placeholder="SAVE20" />
            </div>
            <div>
              <label style={labelStyle}>Type *</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Coupon['type'] }))} style={inputStyle}>
                <option value="percentage">Percentage Off</option>
                <option value="fixed">Fixed Amount Off ($)</option>
                <option value="free_shipping">Free Shipping</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>{form.type === 'percentage' ? 'Discount %' : 'Discount $'}</label>
              <input type="number" step="0.01" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Min Order ($)</label>
              <input type="number" step="0.01" min="0" value={form.min_order} onChange={e => setForm(p => ({ ...p, min_order: e.target.value }))} style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Max Uses</label>
              <input type="number" min="1" value={form.max_uses} onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))} style={inputStyle} placeholder="Unlimited" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Starts At</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expires At</label>
              <input type="datetime-local" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="coupon_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="coupon_active" style={{ fontSize: '0.85rem', color: '#374151' }}>Active</label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={saving} style={{
              padding: '0.5rem 1.25rem', background: saving ? '#94a3b8' : '#0f172a', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} style={{
              padding: '0.5rem 1.25rem', background: '#fff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Coupons list */}
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading...</p>
      ) : coupons.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No coupons yet. Create one to get started.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {coupons.map(c => (
            <div key={c.id} style={{
              ...cardStyle,
              opacity: c.is_active ? 1 : 0.6,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', fontFamily: 'monospace' }}>{c.code}</span>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                    background: c.is_active ? '#dcfce7' : '#f1f5f9', color: c.is_active ? '#16a34a' : '#94a3b8',
                  }}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  {c.type === 'percentage' ? `${c.value}% off` : c.type === 'fixed' ? `$${c.value} off` : 'Free shipping'}
                  {c.min_order_cents > 0 && ` · Min $${(c.min_order_cents / 100).toFixed(2)}`}
                  {c.max_uses != null && ` · ${c.uses_count}/${c.max_uses} used`}
                  {c.expires_at && ` · Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={() => toggleActive(c)} style={smallBtnStyle}>
                  {c.is_active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => editCoupon(c)} style={smallBtnStyle}>Edit</button>
                <button onClick={() => deleteCoupon(c.id)} style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fecaca' }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.75rem',
  cursor: 'pointer', fontWeight: 500,
};
