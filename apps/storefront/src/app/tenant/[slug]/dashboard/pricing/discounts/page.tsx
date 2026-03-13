'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantFetch } from '../../../../../../lib/api';

interface DiscountRule {
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'bogo';
  value: number;
  min_qty: number;
  category: string | null;
  product_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

const emptyRule: Omit<DiscountRule, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  type: 'percentage',
  value: 0,
  min_qty: 1,
  category: null,
  product_id: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

const typeLabels: Record<string, string> = {
  percentage: 'Percentage Off',
  fixed: 'Fixed Amount Off',
  bogo: 'Buy One Get One',
};

export default function DiscountRulesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchRules = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: DiscountRule[] }>(slug, token, '/api/products/discount-rules');
      setRules(res.data);
    } catch (err) {
      console.error('Failed to load discount rules:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function openCreate() {
    setForm(emptyRule);
    setEditingId(null);
    setShowForm(true);
    setError('');
  }

  function openEdit(rule: DiscountRule) {
    setForm({
      name: rule.name,
      type: rule.type,
      value: rule.value,
      min_qty: rule.min_qty,
      category: rule.category,
      product_id: rule.product_id,
      is_active: rule.is_active,
      starts_at: rule.starts_at,
      ends_at: rule.ends_at,
    });
    setEditingId(rule.id);
    setShowForm(true);
    setError('');
  }

  async function handleSave() {
    if (!token || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        ...form,
        category: form.category || null,
        product_id: form.product_id || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      });
      const method = editingId ? 'PATCH' : 'POST';
      const path = editingId
        ? `/api/products/discount-rules/${editingId}`
        : '/api/products/discount-rules';
      const res = await tenantFetch(slug, token, path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setShowForm(false);
      fetchRules();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token || !confirm('Delete this discount rule?')) return;
    try {
      await tenantFetch(slug, token, `/api/products/discount-rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function toggleActive(rule: DiscountRule) {
    if (!token) return;
    await tenantFetch(slug, token, `/api/products/discount-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    fetchRules();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '0.875rem', background: '#fff', color: '#111827',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
  };
  const btnGhost: React.CSSProperties = {
    padding: '0.5rem 1rem', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer',
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: 0 }}>Discount Rules</h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Manage percentage, fixed, and BOGO discount rules for your store.
          </p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ New Rule</button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
          padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
            {editingId ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Sale 10% Off" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DiscountRule['type'] })}>
                <option value="percentage">Percentage Off</option>
                <option value="fixed">Fixed Amount Off</option>
                <option value="bogo">Buy One Get One</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Value {form.type === 'percentage' ? '(%)' : form.type === 'fixed' ? '($)' : ''}</label>
              <input style={inputStyle} type="number" min="0" step={form.type === 'percentage' ? '1' : '0.01'}
                value={form.value} onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={labelStyle}>Min Quantity</label>
              <input style={inputStyle} type="number" min="1" value={form.min_qty}
                onChange={(e) => setForm({ ...form, min_qty: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <label style={labelStyle}>Category (optional)</label>
              <input style={inputStyle} value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value || null })} placeholder="Leave blank for all categories" />
            </div>
            <div>
              <label style={labelStyle}>Product ID (optional)</label>
              <input style={inputStyle} value={form.product_id ?? ''} onChange={(e) => setForm({ ...form, product_id: e.target.value || null })} placeholder="Leave blank for all products" />
            </div>
            <div>
              <label style={labelStyle}>Start Date (optional)</label>
              <input style={inputStyle} type="datetime-local"
                value={form.starts_at ? form.starts_at.slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div>
              <label style={labelStyle}>End Date (optional)</label>
              <input style={inputStyle} type="datetime-local"
                value={form.ends_at ? form.ends_at.slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <label style={{ fontSize: '0.85rem', color: '#374151' }}>Active</label>
            </div>
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : editingId ? 'Update' : 'Create'}</button>
            <button onClick={() => setShowForm(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rules table */}
      {loading ? (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>Loading…</p>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No discount rules yet</p>
          <p style={{ fontSize: '0.85rem' }}>Create your first rule to offer discounts to customers.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Value</th>
                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Min Qty</th>
                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0.75rem 1rem', color: '#111827', fontWeight: 500 }}>
                    {rule.name}
                    {rule.category && <span style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>Category: {rule.category}</span>}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>{typeLabels[rule.type] || rule.type}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#111827', fontWeight: 600 }}>
                    {rule.type === 'percentage' ? `${rule.value}%` : rule.type === 'fixed' ? `$${rule.value.toFixed(2)}` : `×${rule.value}`}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#6b7280' }}>{rule.min_qty}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(rule)}
                      style={{
                        padding: '0.2rem 0.6rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                        fontSize: '0.75rem', fontWeight: 600,
                        background: rule.is_active ? '#dcfce7' : '#f3f4f6',
                        color: rule.is_active ? '#16a34a' : '#6b7280',
                      }}
                    >
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button onClick={() => openEdit(rule)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', marginRight: '0.75rem' }}>Edit</button>
                    <button onClick={() => handleDelete(rule.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
