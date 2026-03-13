'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../components/AuthProvider';
import { tenantGet, tenantFetch, tenantPost } from '../../../../../lib/api';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface AccountInfo {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  plan_name: string;
  price_cents: number;
  max_users: number;
  max_products: number;
  features: string[];
  user_count: number;
  product_count: number;
  has_stripe: boolean;
}

interface Plan {
  id: string;
  name: string;
  price_cents: number;
  max_users: number;
  max_products: number;
  features: string[];
}

type Tab = 'general' | 'subscription' | 'danger';

/* ── Styles ────────────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '0.875rem', background: '#fff', color: '#111827',
  boxSizing: 'border-box',
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
const btnDanger: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#dc2626', color: '#fff', border: 'none',
  borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
};
const btnDangerOutline: React.CSSProperties = {
  padding: '0.5rem 1rem', background: 'transparent', color: '#dc2626', border: '1px solid #dc2626',
  borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
};
const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function statusBadge(status: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active:    { bg: '#dcfce7', fg: '#16a34a' },
    trialing:  { bg: '#dbeafe', fg: '#2563eb' },
    past_due:  { bg: '#fef3c7', fg: '#d97706' },
    suspended: { bg: '#fee2e2', fg: '#dc2626' },
    cancelled: { bg: '#f3f4f6', fg: '#6b7280' },
  };
  const c = colors[status] ?? colors.cancelled;
  return (
    <span style={{
      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem',
      fontWeight: 600, background: c.bg, color: c.fg, textTransform: 'capitalize',
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const featureLabels: Record<string, string> = {
  storefront: 'Storefront',
  inventory: 'Inventory Management',
  matrix: 'Team Messaging',
  analytics: 'Analytics Dashboard',
  custom_domain: 'Custom Domain',
  api_access: 'API Access',
};

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function AccountSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { token, user, logout } = useAuth();

  const [tab, setTab] = useState<Tab>('general');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // General tab state
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

  // Password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  // Plan change state
  const [changingPlan, setChangingPlan] = useState('');
  const [planMsg, setPlanMsg] = useState('');

  // Danger zone state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState('');

  const fetchAccount = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [acct, planList] = await Promise.all([
        tenantGet<{ data: AccountInfo }>(slug, token, '/api/account'),
        tenantGet<{ data: Plan[] }>(slug, token, '/api/account/plans'),
      ]);
      setAccount(acct.data);
      setPlans(planList.data);
      setDisplayName(acct.data.display_name);
    } catch (err) {
      console.error('Failed to load account:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);

  /* ── General tab actions ─────────────────────────────────────────────────── */

  async function saveDisplayName() {
    if (!token || !displayName.trim()) return;
    setSavingName(true);
    setNameMsg('');
    try {
      const res = await tenantFetch(slug, token, '/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      setNameMsg('Saved successfully');
      fetchAccount();
    } catch (err) {
      setNameMsg((err as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    if (!token) return;
    setPwError('');
    setPwMsg('');
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try {
      const res = await tenantFetch(slug, token, '/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Password change failed');
      }
      setPwMsg('Password updated successfully');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  /* ── Plan change ─────────────────────────────────────────────────────────── */

  async function handleChangePlan(planName: string) {
    if (!token || changingPlan) return;
    setChangingPlan(planName);
    setPlanMsg('');
    try {
      await tenantPost(slug, token, '/api/account/change-plan', { plan_name: planName });
      setPlanMsg(`Switched to ${planName} plan`);
      fetchAccount();
    } catch (err) {
      setPlanMsg((err as Error).message);
    } finally {
      setChangingPlan('');
    }
  }

  /* ── Danger zone actions ─────────────────────────────────────────────────── */

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    setDangerError('');
    try {
      await tenantPost(slug, token, '/api/account/cancel', {});
      setShowCancelConfirm(false);
      fetchAccount();
    } catch (err) {
      setDangerError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!token || deleteSlugInput !== slug) return;
    setDeleting(true);
    setDangerError('');
    try {
      const res = await tenantFetch(slug, token, '/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Deletion failed');
      }
      logout();
      router.push('/');
    } catch (err) {
      setDangerError((err as Error).message);
      setDeleting(false);
    }
  }

  /* ── Tab navigation ──────────────────────────────────────────────────────── */

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'danger', label: 'Danger Zone' },
  ];

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading account settings…</div>;
  }

  if (!account) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>Failed to load account information.</div>;
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: 0 }}>Account Settings</h1>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Manage your account, subscription, and team settings.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '0.6rem 1.25rem', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            background: 'transparent',
            color: tab === t.key ? '#2563eb' : '#6b7280',
            borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ────────────────────── General Tab ──────────────────────────────────── */}
      {tab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Tenant info */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              Store Information
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input style={inputStyle} value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Slug</label>
                <input style={{ ...inputStyle, background: '#f3f4f6', color: '#6b7280', fontFamily: 'monospace' }}
                  value={account.slug} disabled />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <div style={{ paddingTop: '0.4rem' }}>{statusBadge(account.status)}</div>
              </div>
              <div>
                <label style={labelStyle}>Created</label>
                <div style={{ fontSize: '0.875rem', color: '#374151', paddingTop: '0.4rem' }}>
                  {formatDate(account.created_at)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button onClick={saveDisplayName} disabled={savingName} style={btnPrimary}>
                {savingName ? 'Saving…' : 'Save Changes'}
              </button>
              {nameMsg && <span style={{ fontSize: '0.8rem', color: nameMsg.includes('success') ? '#16a34a' : '#dc2626' }}>{nameMsg}</span>}
            </div>
          </div>

          {/* User profile */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              Your Profile
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={{ ...inputStyle, background: '#f3f4f6', color: '#6b7280' }}
                  value={user?.email ?? ''} disabled />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <input style={{ ...inputStyle, background: '#f3f4f6', color: '#6b7280', textTransform: 'capitalize' }}
                  value={user?.role?.replace('_', ' ') ?? ''} disabled />
              </div>
            </div>
          </div>

          {/* Change password */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              Change Password
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Current Password</label>
                <input style={inputStyle} type="password" value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input style={inputStyle} type="password" value={newPw}
                  onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <input style={inputStyle} type="password" value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)} />
              </div>
            </div>
            {pwError && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.5rem' }}>{pwError}</p>}
            {pwMsg && <p style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '0.5rem' }}>{pwMsg}</p>}
            <div style={{ marginTop: '1rem' }}>
              <button onClick={changePassword} disabled={savingPw || !currentPw || !newPw} style={btnPrimary}>
                {savingPw ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────── Subscription Tab ─────────────────────────────── */}
      {tab === 'subscription' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Current plan summary */}
          <div style={{ ...cardStyle, borderColor: '#3b82f6', borderWidth: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Current Plan
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: '0.25rem 0', textTransform: 'capitalize' }}>
                  {account.plan_name}
                </h2>
                <div style={{ fontSize: '1.1rem', color: '#374151', fontWeight: 600 }}>
                  {formatPrice(account.price_cents)}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#6b7280' }}>/month</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {statusBadge(account.status)}
                {account.trial_ends_at && (
                  <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.5rem' }}>
                    Trial ends {formatDate(account.trial_ends_at)}
                  </div>
                )}
              </div>
            </div>

            {/* Usage bars */}
            <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <UsageBar label="Users" current={account.user_count} max={account.max_users} />
              <UsageBar label="Products" current={account.product_count} max={account.max_products} />
            </div>

            {/* Features list */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Included Features</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {account.features.map((f) => (
                  <span key={f} style={{
                    padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem',
                    background: '#eff6ff', color: '#2563eb', fontWeight: 500,
                  }}>
                    {featureLabels[f] ?? f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Plan message */}
          {planMsg && (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
              background: planMsg.includes('Switched') ? '#dcfce7' : '#fee2e2',
              color: planMsg.includes('Switched') ? '#16a34a' : '#dc2626',
            }}>
              {planMsg}
            </div>
          )}

          {/* Available plans */}
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Available Plans</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {plans.map((plan) => {
              const isCurrent = plan.name === account.plan_name;
              const isUpgrade = plan.price_cents > account.price_cents;
              return (
                <div key={plan.id} style={{
                  ...cardStyle,
                  borderColor: isCurrent ? '#3b82f6' : '#e5e7eb',
                  borderWidth: isCurrent ? '2px' : '1px',
                  opacity: changingPlan && changingPlan !== plan.name ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', textTransform: 'capitalize' }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: '0.5rem 0' }}>
                    {formatPrice(plan.price_cents)}
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280' }}>/mo</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    {plan.max_users} users · {plan.max_products >= 99999 ? 'Unlimited' : plan.max_products.toLocaleString()} products
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem 0' }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ fontSize: '0.8rem', color: '#374151', padding: '0.15rem 0' }}>
                        ✓ {featureLabels[f] ?? f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div style={{
                      padding: '0.5rem 1rem', textAlign: 'center', borderRadius: '6px',
                      background: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '0.85rem',
                    }}>
                      Current Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleChangePlan(plan.name)}
                      disabled={!!changingPlan}
                      style={{
                        ...btnPrimary,
                        width: '100%',
                        background: isUpgrade ? '#2563eb' : '#6b7280',
                      }}
                    >
                      {changingPlan === plan.name ? 'Switching…' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────────── Danger Zone Tab ──────────────────────────────── */}
      {tab === 'danger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {dangerError && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', background: '#fee2e2', color: '#dc2626', fontSize: '0.85rem' }}>
              {dangerError}
            </div>
          )}

          {/* Cancel subscription */}
          <div style={{ ...cardStyle, borderColor: '#fbbf24' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
              Cancel Subscription
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
              Cancelling your subscription will set your store to inactive. Your data will be preserved and you can reactivate later.
            </p>
            {account.status === 'cancelled' ? (
              <div style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: '#f3f4f6', color: '#6b7280', fontSize: '0.85rem' }}>
                Your subscription is already cancelled.
              </div>
            ) : !showCancelConfirm ? (
              <button onClick={() => setShowCancelConfirm(true)} style={btnDangerOutline}>
                Cancel Subscription
              </button>
            ) : (
              <div style={{ padding: '1rem', borderRadius: '6px', background: '#fffbeb', border: '1px solid #fbbf24' }}>
                <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '0.75rem', fontWeight: 600 }}>
                  Are you sure? Your store will become inactive immediately.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={handleCancel} disabled={cancelling} style={btnDanger}>
                    {cancelling ? 'Cancelling…' : 'Yes, Cancel Subscription'}
                  </button>
                  <button onClick={() => setShowCancelConfirm(false)} style={btnGhost}>
                    Keep Subscription
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Delete account */}
          <div style={{ ...cardStyle, borderColor: '#dc2626' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.5rem' }}>
              Delete Account
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Permanently delete your store and all associated data. This action <strong>cannot be undone</strong>.
            </p>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
              This will delete all products, orders, users, files, and settings. Your Stripe subscription and Connect account will be disconnected.
            </p>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={btnDanger}>
                Delete Account Permanently
              </button>
            ) : (
              <div style={{ padding: '1rem', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fca5a5' }}>
                <p style={{ fontSize: '0.85rem', color: '#991b1b', marginBottom: '0.75rem', fontWeight: 600 }}>
                  This will permanently destroy all data for this tenant. Type <code style={{ background: '#fee2e2', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700 }}>{slug}</code> to confirm:
                </p>
                <input
                  style={{ ...inputStyle, borderColor: '#fca5a5', marginBottom: '0.75rem', maxWidth: '300px' }}
                  value={deleteSlugInput}
                  onChange={(e) => setDeleteSlugInput(e.target.value)}
                  placeholder={slug}
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleDelete}
                    disabled={deleting || deleteSlugInput !== slug}
                    style={{
                      ...btnDanger,
                      opacity: deleteSlugInput !== slug ? 0.5 : 1,
                      cursor: deleteSlugInput !== slug ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {deleting ? 'Deleting…' : 'I understand, delete this account'}
                  </button>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteSlugInput(''); }} style={btnGhost}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  const isHigh = pct > 80;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>{label}</span>
        <span style={{ color: isHigh ? '#dc2626' : '#6b7280' }}>{current} / {max >= 99999 ? '∞' : max}</span>
      </div>
      <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '3px',
          background: isHigh ? '#dc2626' : '#3b82f6',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
