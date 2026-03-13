'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../components/AuthProvider';
import { tenantGet, tenantPost, tenantPatch, tenantDelete } from '../../../../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: 'tenant_admin' | 'operator' | 'viewer';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface UserForm {
  username: string;
  email: string;
  display_name: string;
  role: 'tenant_admin' | 'operator' | 'viewer';
  password: string;
  is_active: boolean;
}

const EMPTY_FORM: UserForm = {
  username: '', email: '', display_name: '', role: 'operator', password: '', is_active: true,
};

const ROLE_INFO: Record<string, { label: string; color: string; bg: string; description: string }> = {
  tenant_admin: {
    label: 'Admin',
    color: '#7c3aed',
    bg: '#f3e8ff',
    description: 'Full access. Can manage users, billing, and all store settings.',
  },
  operator: {
    label: 'Operator',
    color: '#2563eb',
    bg: '#eff6ff',
    description: 'Can manage products, orders, and daily operations.',
  },
  viewer: {
    label: 'Viewer',
    color: '#64748b',
    bg: '#f1f5f9',
    description: 'Read-only access to dashboard and reports.',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user: currentUser, token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Message
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch users ────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: User[] }>(slug, token, '/api/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Filtered users ─────────────────────────────────────────────────────────

  const filtered = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setModalError('');
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditingUser(u);
    setForm({
      username: u.username,
      email: u.email,
      display_name: u.display_name ?? '',
      role: u.role,
      password: '',
      is_active: u.is_active,
    });
    setModalError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setModalError('');
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setModalError('');

    try {
      if (editingUser) {
        // Update existing user
        const body: Record<string, unknown> = {};
        if (form.username !== editingUser.username) body.username = form.username;
        if (form.email !== editingUser.email) body.email = form.email;
        if ((form.display_name || null) !== editingUser.display_name) body.display_name = form.display_name || undefined;
        if (form.role !== editingUser.role) body.role = form.role;
        if (form.is_active !== editingUser.is_active) body.is_active = form.is_active;
        if (form.password) body.password = form.password;

        if (Object.keys(body).length === 0) {
          closeModal();
          return;
        }

        await tenantPatch(slug, token, `/api/users/${editingUser.id}`, body);
        setMessage({ text: `User "${form.username}" updated successfully.`, type: 'success' });
      } else {
        // Create new user
        if (!form.password || form.password.length < 8) {
          setModalError('Password must be at least 8 characters.');
          setSaving(false);
          return;
        }
        await tenantPost(slug, token, '/api/users', {
          username: form.username,
          email: form.email,
          display_name: form.display_name || undefined,
          role: form.role,
          password: form.password,
        });
        setMessage({ text: `User "${form.username}" created successfully.`, type: 'success' });
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      setModalError((err as Error).message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete handlers ────────────────────────────────────────────────────────

  async function handleDelete(userId: string) {
    if (!token) return;
    setDeleteError('');
    try {
      await tenantDelete(slug, token, `/api/users/${userId}`);
      setDeletingId(null);
      setMessage({ text: 'User removed successfully.', type: 'success' });
      fetchUsers();
    } catch (err) {
      setDeleteError((err as Error).message || 'Failed to delete user.');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isSelf(u: User) {
    return currentUser?.email === u.email;
  }

  // Clear messages after 4s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Users</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Manage team members and their permissions.
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtnStyle}>+ Add User</button>
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
          placeholder="Search by name, email, or username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
            background: '#fff', minWidth: '150px',
          }}
        >
          <option value="">All roles</option>
          <option value="tenant_admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Username</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Role</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
              <th style={thStyle}>Last Login</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  {search || roleFilter ? 'No users match your filters.' : 'No users found.'}
                </td>
              </tr>
            ) : filtered.map((u) => {
              const role = ROLE_INFO[u.role];
              const isDeleting = deletingId === u.id;
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* User info */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: role.bg, color: role.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                      }}>
                        {(u.display_name ?? u.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>
                          {u.display_name ?? u.username}
                          {isSelf(u) && <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.4rem' }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  {/* Username */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
                    {u.username}
                  </td>
                  {/* Role badge */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: role.bg, color: role.color,
                    }}>
                      {role.label}
                    </span>
                  </td>
                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: u.is_active ? '#dcfce7' : '#f1f5f9',
                      color: u.is_active ? '#16a34a' : '#94a3b8',
                    }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Last login */}
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.8rem' }}>
                    {formatDate(u.last_login_at)}
                  </td>
                  {/* Actions */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {isDeleting ? (
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => handleDelete(u.id)} style={dangerSmBtn}>Confirm</button>
                        <button onClick={() => { setDeletingId(null); setDeleteError(''); }} style={cancelSmBtn}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(u)} style={actionBtn}>Edit</button>
                        {!isSelf(u) && (
                          <button onClick={() => setDeletingId(u.id)} style={{ ...actionBtn, color: '#dc2626' }}>Remove</button>
                        )}
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

      {/* Users count */}
      {!loading && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}{roleFilter || search ? ' matching filters' : ' total'}
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px',
            maxHeight: '90vh', overflow: 'auto', padding: '2rem',
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
          }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </h2>

            {modalError && (
              <div style={{
                padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem',
                background: '#fef2f2', color: '#dc2626', fontSize: '0.85rem',
                border: '1px solid #fecaca',
              }}>
                {modalError}
              </div>
            )}

            {/* Username */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="e.g. john.doe"
                style={inputStyle}
              />
              <span style={hintStyle}>3-50 characters, letters/numbers/._- only</span>
            </div>

            {/* Email */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                style={inputStyle}
              />
            </div>

            {/* Display Name */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Display Name</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="John Doe"
                style={inputStyle}
              />
            </div>

            {/* Password */}
            <div style={fieldGroup}>
              <label style={labelStyle}>
                Password {editingUser ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? '••••••••' : 'Min 8 characters'}
                style={inputStyle}
              />
            </div>

            {/* Role selector */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Role *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(['tenant_admin', 'operator', 'viewer'] as const).map((r) => {
                  const info = ROLE_INFO[r];
                  const selected = form.role === r;
                  return (
                    <label
                      key={r}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                        padding: '0.75rem', borderRadius: '10px', cursor: 'pointer',
                        border: `2px solid ${selected ? info.color : '#e2e8f0'}`,
                        background: selected ? info.bg : '#fff',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={selected}
                        onChange={() => setForm({ ...form, role: r })}
                        style={{ marginTop: '0.15rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                          {info.label}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                          {info.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Active toggle (edit only) */}
            {editingUser && (
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
                  {form.is_active ? 'User can log in' : 'User is deactivated'}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={closeModal} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                ...primaryBtnStyle, opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
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

const hintStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem',
};
