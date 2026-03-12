'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../components/AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

interface DashStats {
  productCount: number;
  orderCount: number;
  recentOrders: any[];
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '12px', padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderTop: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
      <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );
}

export default function TenantDashboardPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const { token } = useAuth();

  const [stats, setStats]     = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'x-tenant-slug': slug,
        };

        const [productsRes, ordersRes] = await Promise.all([
          fetch(`${API_URL}/api/products?limit=1`, { headers }),
          fetch(`${API_URL}/api/orders?limit=5`, { headers }),
        ]);

        const productsBody = productsRes.ok ? await productsRes.json() : { pagination: { total: 0 } };
        const ordersBody   = ordersRes.ok   ? await ordersRes.json()   : { pagination: { total: 0 }, data: [] };

        setStats({
          productCount: productsBody.pagination?.total ?? 0,
          orderCount:   ordersBody.pagination?.total ?? 0,
          recentOrders: ordersBody.data ?? [],
        });
      } catch (err) {
        console.error('Failed to load dashboard stats', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, slug]);

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
        Dashboard
      </h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Welcome to your store management dashboard.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Products" value={stats?.productCount ?? 0} color="#3b82f6" />
        <StatCard label="Orders" value={stats?.orderCount ?? 0} color="#22c55e" />
      </div>

      {/* Quick links */}
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '2rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { href: `/tenant/${slug}/products`, label: 'Manage Products' },
            { href: `/tenant/${slug}/workspace`, label: 'Team Workspace' },
            { href: `/tenant/${slug}/settings`, label: 'Store Settings' },
            { href: `/tenant/${slug}`, label: 'View Storefront' },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding: '0.6rem 1.25rem', background: '#f1f5f9', color: '#0f172a',
              borderRadius: '8px', textDecoration: 'none', fontSize: '0.875rem',
              fontWeight: 500, border: '1px solid #e2e8f0',
            }}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent orders */}
      {stats && stats.recentOrders.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
              Recent Orders
            </h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Order #', 'Customer', 'Status', 'Total'].map((h) => (
                  <th key={h} style={{
                    padding: '0.75rem 1.5rem', textAlign: 'left',
                    fontSize: '0.75rem', fontWeight: 600, color: '#64748b',
                    textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((o: any, i: number) => (
                <tr key={o.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding: '0.75rem 1.5rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#3b82f6' }}>
                    {o.order_number}
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem' }}>{o.customer_name ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1.5rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: o.status === 'delivered' ? '#dcfce7' : o.status === 'pending' ? '#fef3c7' : '#f1f5f9',
                      color: o.status === 'delivered' ? '#16a34a' : o.status === 'pending' ? '#d97706' : '#64748b',
                    }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem' }}>
                    ${((o.total_cents ?? 0) / 100).toFixed(2)}
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
