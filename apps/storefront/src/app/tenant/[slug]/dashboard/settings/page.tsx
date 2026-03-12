'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

interface ConnectStatus {
  connected:         boolean;
  account_id?:       string;
  charges_enabled?:  boolean;
  payouts_enabled?:  boolean;
  details_submitted?: boolean;
  platform_fee_pct?: number;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: ok ? '#22c55e' : '#94a3b8', display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{ color: ok ? '#15803d' : '#94a3b8' }}>{label}</span>
    </div>
  );
}

export default function DashboardSettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [status, setStatus]       = useState<ConnectStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]         = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const tenantHeaders = { 'x-tenant-slug': slug };

  const loadStatus = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/stripe-connect/status`, {
        credentials: 'include', headers: tenantHeaders,
      });
      const body = res.ok ? await res.json() : { connected: false };
      setStatus(body);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, [slug]);

  const handleConnect = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/stripe-connect/oauth-url`, {
        credentials: 'include', headers: tenantHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to get OAuth URL');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/stripe-connect/disconnect`, {
        method: 'POST', credentials: 'include', headers: tenantHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Disconnect failed');
      setConfirmDisconnect(false);
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
        Settings
      </h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>
        Manage your store integrations and billing preferences.
      </p>

      {/* Stripe Connect card */}
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '1.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem',
      }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #635bff 0%, #0073e6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', flexShrink: 0,
          }}>
            💳
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Stripe Payments
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
              Accept payments directly in your store
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading status…</div>
        ) : status?.connected ? (
          <>
            {/* Connected state */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
              padding: '1rem 1.25rem', marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#15803d' }}>✓ Connected</span>
                <code style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                  {status.account_id}
                </code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <StatusBadge ok={!!status.charges_enabled}  label="Charges enabled" />
                <StatusBadge ok={!!status.payouts_enabled}  label="Payouts enabled" />
                <StatusBadge ok={!!status.details_submitted} label="Details submitted" />
              </div>
            </div>

            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
              padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#92400e',
            }}>
              Gadnuc collects a <strong>{status.platform_fee_pct ?? 5}% platform fee</strong> on each order processed through your store.
            </div>

            {confirmDisconnect ? (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Are you sure?</span>
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem', background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  {actionLoading ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  style={{
                    padding: '0.5rem 1rem', background: '#fff', color: '#374151',
                    border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                style={{
                  padding: '0.5rem 1.25rem', background: '#fff', color: '#dc2626',
                  border: '1px solid #fca5a5', borderRadius: '8px',
                  fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Disconnect Stripe
              </button>
            )}
          </>
        ) : (
          <>
            {/* Not connected state */}
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Connect your Stripe account to start accepting payments in your store.
              Your customers pay directly to your Stripe account — Gadnuc collects a small
              platform fee per transaction.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem',
            }}>
              {[
                ['⚡', 'Instant payouts', 'Funds land in your bank account directly'],
                ['🛡️', 'Secure by Stripe', 'PCI-compliant payments out of the box'],
                ['📊', 'Full dashboard', 'Analytics and dispute management in Stripe'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{
                  background: '#f8fafc', borderRadius: '8px', padding: '0.875rem',
                  fontSize: '0.8rem', color: '#64748b',
                }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.375rem' }}>{icon}</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>{title}</div>
                  {desc}
                </div>
              ))}
            </div>
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.7rem 1.5rem',
                background: actionLoading ? '#a5b4fc' : '#635bff',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '0.9rem', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {actionLoading ? 'Redirecting…' : 'Connect with Stripe'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
