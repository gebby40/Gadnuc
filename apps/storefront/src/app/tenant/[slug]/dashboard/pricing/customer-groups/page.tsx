'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantFetch } from '../../../../../../lib/api';

interface CustomerGroup {
  id: string;
  name: string;
  slug: string;
  discount_pct: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const emptyGroup = { name: '', slug: '', discount_pct: 0, is_default: false };

export default function CustomerGroupsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyGroup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: CustomerGroup[] }>(slug, token, '/api/products/customer-groups');
      setGroups(res.data);
    } catch (err) {
      console.error('Failed to load customer groups:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  function openCreate() {
    setForm(emptyGroup);
    setEditingId(null);
    setShowForm(true);
    setError('');
  }

  function openEdit(group: CustomerGroup) {
    setForm({
      name: group.name,
      slug: group.slug,
      discount_pct: group.discount_pct,
      is_default: group.is_default,
    });
    setEditingId(group.id);
    setShowForm(true);
    setError('');
  }

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setForm((prev) => ({
      ...prev,
      name,
      slug: editingId ? prev.slug : autoSlug, // only auto-slug on create
    }));
  }

  async function handleSave() {
    if (!token || !form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    setError('');
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const path = editingId
        ? `/api/products/customer-groups/${editingId}`
        : '/api/products/customer-groups';
      const res = await tenantFetch(slug, token, path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setShowForm(false);
      fetchGroups();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(group: CustomerGroup) {
    if (group.is_default) {
      alert('Cannot delete the default group.');
      return;
    }
    if (!token || !confirm(`Delete group "${group.name}"?`)) return;
    try {
      const res = await tenantFetch(slug, token, `/api/products/customer-groups/${group.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Delete failed');
        return;
      }
      fetchGroups();
    } catch (err) {
      console.error('Delete failed:', err);
    }
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: 0 }}>Customer Groups</h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Define customer groups like Retail and Wholesale with group-level discounts.
          </p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ New Group</button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
          padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
            {editingId ? 'Edit Group' : 'Create Group'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Group Name</label>
              <input style={inputStyle} value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Wholesale" />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input style={inputStyle} value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="e.g. wholesale" disabled={!!editingId} />
            </div>
            <div>
              <label style={labelStyle}>Group Discount (%)</label>
              <input style={inputStyle} type="number" min="0" max="100" step="0.5"
                value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} />
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                Applied automatically to all products for members of this group.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              <label style={{ fontSize: '0.85rem', color: '#374151' }}>Default group for new customers</label>
            </div>
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : editingId ? 'Update' : 'Create'}</button>
            <button onClick={() => setShowForm(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Groups table */}
      {loading ? (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>Loading…</p>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No customer groups yet</p>
          <p style={{ fontSize: '0.85rem' }}>Create groups to offer wholesale pricing and group discounts.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Slug</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Discount</th>
                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600, color: '#374151' }}>Default</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr key={group.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0.75rem 1rem', color: '#111827', fontWeight: 500 }}>{group.name}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.8rem' }}>{group.slug}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#111827', fontWeight: 600 }}>
                    {group.discount_pct > 0 ? `${group.discount_pct}%` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    {group.is_default ? (
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, background: '#dbeafe', color: '#2563eb' }}>Default</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button onClick={() => openEdit(group)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', marginRight: '0.75rem' }}>Edit</button>
                    {!group.is_default && (
                      <button onClick={() => handleDelete(group)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                    )}
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
