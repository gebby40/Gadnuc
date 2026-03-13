'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../components/AuthProvider';
import { tenantGet, tenantPatch, tenantDelete } from '../../../../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
  is_wholesale: boolean;
  last_login_at: string | null;
  created_at: string;
  order_count?: number;
}

interface CustomerForm {
  first_name: string;
  last_name: string;
  phone: string;
  is_active: boolean;
  is_wholesale: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 25;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>({ first_name: '', last_name: '', phone: '', is_active: true, is_wholesale: false });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Message
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch customers ──────────────────────────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('per_page', String(perPage));
      if (search) qs.set('search', search);
      if (statusFilter) qs.set('status', statusFilter);

      const res = await tenantGet<{ data: Customer[]; total: number }>(
        slug, token, `/api/customers?${qs.toString()}`,
      );
      setCustomers(res.data);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token, page, search, statusFilter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Reset page when search/filter changes
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Modal helpers ────────────────────────────────────────────────────────────

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setForm({
      first_name: c.first_name ?? '',
      last_name: c.last_name ?? '',
      phone: c.phone ?? '',
      is_active: c.is_active,
      is_wholesale: c.is_wholesale ?? false,
    });
    setModalError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingCustomer(null);
    setModalError('');
  }

  async function handleSave() {
    if (!token || !editingCustomer) return;
    setSaving(true);
    setModalError('');

    try {
      const body: Record<string, unknown> = {};
      if (form.first_name !== (editingCustomer.first_name ?? '')) body.first_name = form.first_name || undefined;
      if (form.last_name !== (editingCustomer.last_name ?? '')) body.last_name = form.last_name || undefined;
      if (form.phone !== (editingCustomer.phone ?? '')) body.phone = form.phone || undefined;
      if (form.is_active !== editingCustomer.is_active) body.is_active = form.is_active;
      if (form.is_wholesale !== (editingCustomer.is_wholesale ?? false)) body.is_wholesale = form.is_wholesale;

      if (Object.keys(body).length === 0) {
        closeModal();
        return;
      }

      await tenantPatch(slug, token, `/api/customers/${editingCustomer.id}`, body);
      setMessage({ text: `Customer updated successfully.`, type: 'success' });
      closeModal();
      fetchCustomers();
    } catch (err) {
      setModalError((err as Error).message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete handlers ──────────────────────────────────────────────────────────

  async function handleDelete(customerId: string) {
    if (!token) return;
    setDeleteError('');
    try {
      await tenantDelete(slug, token, `/api/customers/${customerId}`);
      setDeletingId(null);
      setMessage({ text: 'Customer removed successfully.', type: 'success' });
      fetchCustomers();
    } catch (err) {
      setDeleteError((err as Error).message || 'Failed to delete customer.');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function customerName(c: Customer): string {
    const parts = [c.first_name, c.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '(no name)';
  }

  // Clear messages after 4s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Customers</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Manage storefront customer accounts.
          </p>
        </div>
        {!loading && (
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
            {total} customer{total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Success/error message */}
      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem',
          background: message.type === 'success' ? '#dcfce7' : '#fef2f2',
          color: message.type === 'success' ? '#16a34a' : '#dc2626',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
            background: '#fff', minWidth: '140px',
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Phone</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Orders</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Wholesale</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
              <th style={thStyle}>Registered</th>
              <th style={thStyle}>Last Login</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  {search || statusFilter ? 'No customers match your filters.' : 'No customers have registered yet.'}
                </td>
              </tr>
            ) : customers.map((c) => {
              const isDeleting = deletingId === c.id;
              const name = customerName(c);
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* Customer info */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: c.is_active ? '#eff6ff' : '#f1f5f9',
                        color: c.is_active ? '#2563eb' : '#94a3b8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                      }}>
                        {(c.first_name ?? c.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>{name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.email}</div>
                      </div>
                    </div>
                  </td>
                  {/* Phone */}
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.8rem' }}>
                    {c.phone || '—'}
                  </td>
                  {/* Order count */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: (c.order_count ?? 0) > 0 ? '#eff6ff' : '#f1f5f9',
                      color: (c.order_count ?? 0) > 0 ? '#2563eb' : '#94a3b8',
                    }}>
                      {c.order_count ?? 0}
                    </span>
                  </td>
                  {/* Wholesale */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {c.is_wholesale && (
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                        fontSize: '0.75rem', fontWeight: 600,
                        background: '#f5f3ff', color: '#7c3aed',
                      }}>
                        Wholesale
                      </span>
                    )}
                  </td>
                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: c.is_active ? '#dcfce7' : '#f1f5f9',
                      color: c.is_active ? '#16a34a' : '#94a3b8',
                    }}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Registered */}
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.8rem' }}>
                    {formatDate(c.created_at)}
                  </td>
                  {/* Last login */}
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.8rem' }}>
                    {formatDate(c.last_login_at)}
                  </td>
                  {/* Actions */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {isDeleting ? (
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => handleDelete(c.id)} style={dangerSmBtn}>Confirm</button>
                        <button onClick={() => { setDeletingId(null); setDeleteError(''); }} style={cancelSmBtn}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(c)} style={actionBtn}>Edit</button>
                        <button onClick={() => setDeletingId(c.id)} style={{ ...actionBtn, color: '#dc2626' }}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleteError && (
        <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>{deleteError}</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ ...paginationBtn, opacity: page === 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ ...paginationBtn, opacity: page === totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {modalOpen && editingCustomer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px',
            maxHeight: '90vh', overflow: 'auto', padding: '2rem',
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
          }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Edit Customer
            </h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
              {editingCustomer.email}
            </p>

            {modalError && (
              <div style={{
                padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem',
                background: '#fef2f2', color: '#dc2626', fontSize: '0.85rem',
                border: '1px solid #fecaca',
              }}>
                {modalError}
              </div>
            )}

            {/* First Name */}
            <div style={fieldGroup}>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="John"
                style={inputStyle}
              />
            </div>

            {/* Last Name */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                style={inputStyle}
              />
            </div>

            {/* Phone */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                style={inputStyle}
              />
            </div>

            {/* Active toggle */}
            <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Active</label>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                  background: form.is_active ? '#3b82f6' : '#d1d5db', cursor: 'pointer',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '3px',
                  left: form.is_active ? '23px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {form.is_active ? 'Customer can log in' : 'Customer is deactivated'}
              </span>
            </div>

            {/* Wholesale toggle */}
            <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Wholesale</label>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_wholesale: !form.is_wholesale })}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                  background: form.is_wholesale ? '#7c3aed' : '#d1d5db', cursor: 'pointer',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '3px',
                  left: form.is_wholesale ? '23px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {form.is_wholesale ? 'Sees wholesale pricing & products' : 'Standard retail customer'}
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={closeModal} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                ...primaryBtnStyle, opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.75rem',
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', verticalAlign: 'middle',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};

const actionBtn: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: 'none', color: '#3b82f6',
  border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem',
  fontWeight: 500, cursor: 'pointer',
};

const dangerSmBtn: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: '#dc2626', color: '#fff',
  border: 'none', borderRadius: '6px', fontSize: '0.8rem',
  fontWeight: 600, cursor: 'pointer',
};

const cancelSmBtn: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: '#fff', color: '#64748b',
  border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem',
  cursor: 'pointer',
};

const paginationBtn: React.CSSProperties = {
  padding: '0.4rem 0.8rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.8rem',
  fontWeight: 500, cursor: 'pointer',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151',
  marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box',
};
