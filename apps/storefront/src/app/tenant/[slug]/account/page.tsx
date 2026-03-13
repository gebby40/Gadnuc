'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../components/AuthProvider';
import { tenantGet, tenantPatch } from '../../../../lib/api';

interface CustomerProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  default_address: {
    line1: string; line2?: string; city: string; state: string; zip: string; country: string;
  } | null;
  created_at: string;
}

interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  image_url: string | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: OrderItem[];
}

export default function CustomerAccountPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user, token, logout } = useAuth();
  const base = `/tenant/${slug}`;

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [profileRes, ordersRes] = await Promise.all([
        tenantGet<{ data: CustomerProfile }>(slug, token, '/api/customers/me'),
        tenantGet<{ data: Order[] }>(slug, token, '/api/customers/me/orders'),
      ]);
      setProfile(profileRes.data);
      setOrders(ordersRes.data);
      setEditForm({
        first_name: profileRes.data.first_name ?? '',
        last_name: profileRes.data.last_name ?? '',
        phone: profileRes.data.phone ?? '',
      });
    } catch (err) {
      console.error('Failed to load account data:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => {
    if (!user || user.role !== 'customer') {
      router.push(`${base}/account/login`);
      return;
    }
    fetchData();
  }, [user, fetchData, router, base]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const body: Record<string, string> = {};
      if (editForm.first_name) body.first_name = editForm.first_name;
      if (editForm.last_name) body.last_name = editForm.last_name;
      if (editForm.phone) body.phone = editForm.phone;
      await tenantPatch(slug, token, '/api/customers/me', body);
      setEditingProfile(false);
      setSaveMsg('Profile updated');
      fetchData();
    } catch (err) {
      setSaveMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    router.push(base);
  }

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const statusColors: Record<string, { bg: string; fg: string }> = {
    pending:    { bg: '#fef3c7', fg: '#92400e' },
    processing: { bg: '#dbeafe', fg: '#1e40af' },
    shipped:    { bg: '#e0e7ff', fg: '#3730a3' },
    delivered:  { bg: '#dcfce7', fg: '#166534' },
    cancelled:  { bg: '#fee2e2', fg: '#991b1b' },
    refunded:   { bg: '#f3e8ff', fg: '#6b21a8' },
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>
        Loading your account...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>My Account</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {profile?.email}
          </p>
        </div>
        <button onClick={handleLogout} style={{
          padding: '0.45rem 1rem', background: '#fff', color: '#dc2626',
          border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.8rem',
          fontWeight: 500, cursor: 'pointer',
        }}>
          Sign Out
        </button>
      </div>

      {saveMsg && (
        <div style={{
          padding: '0.5rem 1rem', background: '#f0fdf4', color: '#166534',
          borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem',
        }}>
          {saveMsg}
        </div>
      )}

      {/* Profile Card */}
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
        padding: '1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Profile</h2>
          {!editingProfile && (
            <button onClick={() => setEditingProfile(true)} style={linkBtnStyle}>Edit</button>
          )}
        </div>

        {editingProfile ? (
          <form onSubmit={handleSaveProfile}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>First Name</label>
                <input type="text" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Last Name</label>
                <input type="text" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <label style={labelStyle}>Phone</label>
            <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" disabled={saving} style={primaryBtnStyle}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingProfile(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.8 }}>
            <div><strong>Name:</strong> {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'}</div>
            <div><strong>Email:</strong> {profile?.email}</div>
            <div><strong>Phone:</strong> {profile?.phone || '—'}</div>
            <div><strong>Member since:</strong> {profile?.created_at ? formatDate(profile.created_at) : '—'}</div>
          </div>
        )}
      </div>

      {/* Orders */}
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
        padding: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: '0 0 1rem' }}>Order History</h2>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#94a3b8' }}>
            <p style={{ margin: '0 0 0.75rem' }}>No orders yet.</p>
            <Link href={`${base}/products`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
              Start shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {orders.map(order => {
              const sc = statusColors[order.status] ?? { bg: '#f1f5f9', fg: '#64748b' };
              return (
                <Link
                  key={order.id}
                  href={`${base}/account/orders/${order.order_number}`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9',
                    textDecoration: 'none', color: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                      {order.order_number}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {formatDate(order.created_at)} · {order.items?.length ?? 0} item{order.items?.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem',
                      fontWeight: 600, background: sc.bg, color: sc.fg,
                    }}>
                      {order.status}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                      {formatPrice(order.total_cents)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: '#374151', marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 600, cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 500, cursor: 'pointer',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
  padding: 0,
};
