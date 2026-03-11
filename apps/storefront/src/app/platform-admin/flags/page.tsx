'use client';

import { useEffect, useState } from 'react';

const MANAGER_URL = process.env.NEXT_PUBLIC_MANAGER_URL ?? 'http://localhost:3002';

interface FlagRow {
  id:          string;
  flag_name:   string;
  tenant_id:   string | null;
  tenant_slug: string | null;
  enabled:     boolean;
  rollout_pct: number;
  updated_at:  string;
}

interface Tenant { id: string; slug: string; display_name: string; }

export default function FeatureFlagsPage() {
  const [flags, setFlags]     = useState<FlagRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string>('__global__');
  const [newFlag, setNewFlag] = useState({ flag_name: '', tenant_id: '', enabled: true, rollout_pct: 100 });
  const [addError, setAddError] = useState('');

  const load = async () => {
    try {
      const [flagsRes, tenantsRes] = await Promise.all([
        fetch(`${MANAGER_URL}/api/feature-flags`, { credentials: 'include' }),
        fetch(`${MANAGER_URL}/api/tenants`,        { credentials: 'include' }),
      ]);
      const flagsBody   = flagsRes.ok   ? await flagsRes.json()   : { data: [] };
      const tenantsBody = tenantsRes.ok ? await tenantsRes.json() : { data: [] };
      setFlags(flagsBody.data ?? []);
      setTenants(tenantsBody.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const upsertFlag = async (flag: { flag_name: string; tenant_id: string | null; enabled: boolean; rollout_pct: number }) => {
    setSaving(flag.flag_name + (flag.tenant_id ?? ''));
    try {
      await fetch(`${MANAGER_URL}/api/feature-flags`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...flag, tenant_id: flag.tenant_id || null }),
      });
      await load();
    } finally { setSaving(null); }
  };

  const deleteFlag = async (id: string) => {
    if (!confirm('Delete this flag override?')) return;
    await fetch(`${MANAGER_URL}/api/feature-flags/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    await load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newFlag.flag_name.trim()) { setAddError('Flag name is required'); return; }
    await upsertFlag({
      flag_name:   newFlag.flag_name.trim(),
      tenant_id:   newFlag.tenant_id || null,
      enabled:     newFlag.enabled,
      rollout_pct: newFlag.rollout_pct,
    });
    setNewFlag({ flag_name: '', tenant_id: '', enabled: true, rollout_pct: 100 });
  };

  const filteredFlags = flags.filter((f) =>
    tenantFilter === '__global__' ? f.tenant_id === null
    : tenantFilter === '__all__'  ? true
    : f.tenant_id === tenantFilter,
  );

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
        Feature Flags
      </h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Manage global and per-tenant feature flags. Changes apply within 60 seconds.
      </p>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { val: '__global__', label: '🌐 Global' },
          { val: '__all__',    label: '📋 All' },
          ...tenants.map((t) => ({ val: t.id, label: `🏢 ${t.slug}` })),
        ].map(({ val, label }) => (
          <button
            key={val}
            onClick={() => setTenantFilter(val)}
            style={{
              padding: '0.35rem 0.9rem', borderRadius: '999px', border: '1px solid',
              borderColor: tenantFilter === val ? '#3b82f6' : '#e2e8f0',
              background:  tenantFilter === val ? '#eff6ff' : '#fff',
              color:       tenantFilter === val ? '#1d4ed8' : '#64748b',
              fontSize: '0.8rem', fontWeight: tenantFilter === val ? 600 : 400, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add flag form */}
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '1.25rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', marginBottom: '1rem' }}>
          Add / Update Flag
        </h2>
        {addError && (
          <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            {addError}
          </div>
        )}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Flag name</span>
            <input
              placeholder="e.g. matrix"
              value={newFlag.flag_name}
              onChange={(e) => setNewFlag((f) => ({ ...f, flag_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
              style={{ padding: '0.45rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 140px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Tenant (blank = global)</span>
            <select
              value={newFlag.tenant_id}
              onChange={(e) => setNewFlag((f) => ({ ...f, tenant_id: e.target.value }))}
              style={{ padding: '0.45rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
            >
              <option value="">— Global —</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.slug}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '0 0 80px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Rollout %</span>
            <input
              type="number" min={0} max={100}
              value={newFlag.rollout_pct}
              onChange={(e) => setNewFlag((f) => ({ ...f, rollout_pct: Number(e.target.value) }))}
              style={{ padding: '0.45rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', paddingBottom: '0.45rem' }}>
            <input
              type="checkbox"
              checked={newFlag.enabled}
              onChange={(e) => setNewFlag((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled
          </label>

          <button
            type="submit"
            style={{
              padding: '0.5rem 1.25rem', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Save Flag
          </button>
        </form>
      </div>

      {/* Flags table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Flag', 'Scope', 'Enabled', 'Rollout %', 'Updated', 'Actions'].map((h) => (
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
              {filteredFlags.map((flag, i) => {
                const isSaving = saving === flag.flag_name + (flag.tenant_id ?? '');
                return (
                  <tr key={flag.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'monospace', fontSize: '0.875rem', color: '#0f172a', fontWeight: 600 }}>
                      {flag.flag_name}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: flag.tenant_slug ? '#3b82f6' : '#8b5cf6' }}>
                      {flag.tenant_slug ? `🏢 ${flag.tenant_slug}` : '🌐 Global'}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <button
                        disabled={isSaving}
                        onClick={() => upsertFlag({ flag_name: flag.flag_name, tenant_id: flag.tenant_id, enabled: !flag.enabled, rollout_pct: flag.rollout_pct })}
                        style={{
                          width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                          background: flag.enabled ? '#22c55e' : '#d1d5db',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                        title={flag.enabled ? 'Disable' : 'Enable'}
                      >
                        <span style={{
                          position: 'absolute', top: '2px',
                          left: flag.enabled ? '22px' : '2px',
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: '#fff', transition: 'left 0.2s',
                        }} />
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.875rem', color: '#64748b' }}>
                      {flag.rollout_pct}%
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(flag.updated_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <button
                        onClick={() => deleteFlag(flag.id)}
                        style={{
                          background: 'transparent', border: '1px solid #fecaca', color: '#dc2626',
                          borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredFlags.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                    No flags in this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
