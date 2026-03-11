'use client';

import { useEffect, useState } from 'react';

const MANAGER_URL = process.env.NEXT_PUBLIC_MANAGER_URL ?? 'http://localhost:3002';

interface Stats {
  totalTenants: number;
  activeTenants: number;
  trialingTenants: number;
  totalFlags: number;
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

export default function PlatformAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTenants, setRecentTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [tenantsRes, flagsRes] = await Promise.all([
          fetch(`${MANAGER_URL}/api/tenants`, { credentials: 'include' }),
          fetch(`${MANAGER_URL}/api/feature-flags`, { credentials: 'include' }),
        ]);

        const tenantsBody = tenantsRes.ok ? await tenantsRes.json() : { data: [] };
        const flagsBody   = flagsRes.ok  ? await flagsRes.json()   : { data: [] };

        const tenants: any[] = tenantsBody.data ?? [];
        const flags: any[]   = flagsBody.data ?? [];

        setStats({
          totalTenants:    tenants.length,
          activeTenants:   tenants.filter((t) => t.status === 'active').length,
          trialingTenants: tenants.filter((t) => t.status === 'trialing').length,
          totalFlags:      flags.length,
        });

        setRecentTenants(tenants.slice(0, 8));
      } catch (err) {
        console.error('Failed to load admin stats', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading…</div>;
  }

  const statusColor: Record<string, string> = {
    active:    '#22c55e',
    trialing:  '#f59e0b',
    past_due:  '#ef4444',
    suspended: '#ef4444',
    cancelled: '#94a3b8',
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
        Platform Overview
      </h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Real-time snapshot of the Gadnuc multi-tenant platform.
      </p>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Total Tenants"    value={stats?.totalTenants ?? 0}    color="#3b82f6" />
        <StatCard label="Active"           value={stats?.activeTenants ?? 0}   color="#22c55e" />
        <StatCard label="Trialing"         value={stats?.trialingTenants ?? 0} color="#f59e0b" />
        <StatCard label="Feature Flags"    value={stats?.totalFlags ?? 0}      color="#8b5cf6" />
      </div>

      {/* Recent tenants */}
      <div style={{
        background: '#fff', borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden',
      }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
            Recent Tenants
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Slug', 'Display Name', 'Plan', 'Status', 'Created'].map((h) => (
                <th key={h} style={{
                  padding: '0.75rem 1.5rem', textAlign: 'left',
                  fontSize: '0.75rem', fontWeight: 600, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTenants.map((t, i) => (
              <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <td style={{ padding: '0.875rem 1.5rem', fontFamily: 'monospace', fontSize: '0.875rem', color: '#3b82f6' }}>
                  {t.slug}
                </td>
                <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.875rem', color: '#0f172a' }}>
                  {t.display_name}
                </td>
                <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                  {t.plan_name ?? '—'}
                </td>
                <td style={{ padding: '0.875rem 1.5rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px',
                    fontSize: '0.75rem', fontWeight: 600,
                    background: `${statusColor[t.status] ?? '#94a3b8'}22`,
                    color: statusColor[t.status] ?? '#94a3b8',
                  }}>
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: '0.875rem 1.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {recentTenants.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                  No tenants yet — provision one from the Tenants page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
