'use client';

import { useEffect, useState } from 'react';

const MANAGER_URL = process.env.NEXT_PUBLIC_MANAGER_URL ?? 'http://localhost:3002';

interface Tenant {
  id:                      string;
  slug:                    string;
  display_name:            string;
  plan_name:               string;
  status:                  string;
  stripe_connect_enabled:  boolean;
  stripe_subscription_id:  string | null;
  schema_provisioned:      boolean;
  trial_ends_at:           string;
  created_at:              string;
}

interface ProvisionForm {
  slug:         string;
  display_name: string;
  plan:         string;
  owner_email:  string;
  owner_name:   string;
  owner_password: string;
}

const defaultForm: ProvisionForm = {
  slug: '', display_name: '', plan: 'starter',
  owner_email: '', owner_name: '', owner_password: '',
};

const statusColor: Record<string, string> = {
  active: '#22c55e', trialing: '#f59e0b',
  past_due: '#ef4444', suspended: '#ef4444', cancelled: '#94a3b8',
};

export default function TenantsPage() {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]         = useState<ProvisionForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [deleteConfirm, setDeleteConfirm]   = useState('');
  const [deleting, setDeleting]             = useState(false);
  const [deleteError, setDeleteError]       = useState('');

  const loadTenants = async () => {
    try {
      const res  = await fetch(`${MANAGER_URL}/api/tenants`, { credentials: 'include' });
      const body = res.ok ? await res.json() : { data: [] };
      setTenants(body.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTenants(); }, []);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${MANAGER_URL}/api/tenants/provision`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Provision failed');
      }
      setShowModal(false);
      setForm(defaultForm);
      await loadTenants();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTenant) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${MANAGER_URL}/api/tenants/${deletingTenant.id}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Delete failed');
      }
      setDeletingTenant(null);
      setDeleteConfirm('');
      await loadTenants();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.slug.includes(search.toLowerCase()) ||
      t.display_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Tenants</h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0' }}>{tenants.length} total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Provision Tenant
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="Search by slug or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '0.6rem 1rem', marginBottom: '1rem',
          border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem',
          outline: 'none', boxSizing: 'border-box',
        }}
      />

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Slug', 'Name', 'Plan', 'Status', 'Schema', 'Stripe', 'Created', ''].map((h) => (
                  <th key={h} style={{
                    padding: '0.75rem 1.25rem', textAlign: 'left',
                    fontSize: '0.75rem', fontWeight: 600, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'monospace', fontSize: '0.875rem', color: '#3b82f6' }}>
                    {t.slug}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.875rem', color: '#0f172a' }}>
                    {t.display_name}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.875rem', color: '#64748b', textTransform: 'capitalize' }}>
                    {t.plan_name ?? '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                      background: `${statusColor[t.status] ?? '#94a3b8'}22`,
                      color: statusColor[t.status] ?? '#94a3b8',
                    }}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '1rem' }}>
                    {t.schema_provisioned ? '✅' : '⏳'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '1rem' }}>
                    {t.stripe_connect_enabled ? '✅' : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <button
                      onClick={() => { setDeletingTenant(t); setDeleteConfirm(''); setDeleteError(''); }}
                      style={{
                        padding: '0.3rem 0.75rem', border: '1px solid #fecaca', borderRadius: '6px',
                        background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                    {search ? 'No matching tenants.' : 'No tenants yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Provision modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '2rem',
            width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem' }}>
              Provision New Tenant
            </h2>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleProvision}>
              {([
                ['slug',           'Tenant Slug',     'text',     'acme-corp'],
                ['display_name',   'Display Name',    'text',     'Acme Corporation'],
                ['owner_email',    'Owner Email',     'email',    'owner@acme.com'],
                ['owner_name',     'Owner Name',      'text',     'Jane Smith'],
                ['owner_password', 'Owner Password',  'password', ''],
              ] as const).map(([field, label, type, placeholder]) => (
                <label key={field} style={{ display: 'block', marginBottom: '1rem' }}>
                  <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
                    {label}
                  </span>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(form as any)[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    required
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                      borderRadius: '6px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </label>
              ))}

              <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
                  Plan
                </span>
                <select
                  value={form.plan}
                  onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                  style={{
                    width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                    borderRadius: '6px', fontSize: '0.875rem', outline: 'none',
                  }}
                >
                  <option value="starter">Starter — $29/mo</option>
                  <option value="professional">Professional — $99/mo</option>
                  <option value="enterprise">Enterprise — $299/mo</option>
                </select>
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(''); setForm(defaultForm); }}
                  style={{
                    padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '8px',
                    background: '#fff', color: '#374151', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1.25rem', border: 'none', borderRadius: '8px',
                    background: submitting ? '#93c5fd' : '#3b82f6',
                    color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Provisioning…' : 'Provision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingTenant && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '2rem',
            width: '480px', maxWidth: '90vw',
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.5rem' }}>
              Remove Tenant
            </h2>
            <p style={{ color: '#374151', fontSize: '0.875rem', marginBottom: '1rem' }}>
              You are about to permanently delete <strong>{deletingTenant.display_name}</strong>{' '}
              (<code style={{ background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem' }}>{deletingTenant.slug}</code>).
            </p>

            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
              padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#991b1b',
            }}>
              <strong>Warning:</strong> This will permanently delete all tenant data (users, products, orders, messages)
              {deletingTenant.stripe_subscription_id ? ' and cancel their Stripe subscription' : ''}.
              This action cannot be undone.
            </div>

            {deleteError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem',
              }}>
                {deleteError}
              </div>
            )}

            <label style={{ display: 'block', marginBottom: '1.5rem' }}>
              <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
                Type <strong>{deletingTenant.slug}</strong> to confirm
              </span>
              <input
                type="text"
                placeholder={deletingTenant.slug}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                style={{
                  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setDeletingTenant(null); setDeleteConfirm(''); setDeleteError(''); }}
                style={{
                  padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '8px',
                  background: '#fff', color: '#374151', fontSize: '0.875rem', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirm !== deletingTenant.slug || deleting}
                onClick={handleDelete}
                style={{
                  padding: '0.5rem 1.25rem', border: 'none', borderRadius: '8px',
                  background: (deleteConfirm !== deletingTenant.slug || deleting) ? '#fca5a5' : '#dc2626',
                  color: '#fff', fontSize: '0.875rem', fontWeight: 600,
                  cursor: (deleteConfirm !== deletingTenant.slug || deleting) ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
