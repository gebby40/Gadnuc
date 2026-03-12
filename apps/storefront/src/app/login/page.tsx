'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import {
  platformLogin,
  tenantLogin,
  tenantMfaVerify,
  decodeTokenPayload,
  isMfaRequired,
} from '../../lib/auth';

type Mode = 'platform' | 'tenant';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [mode, setMode] = useState<Mode>('tenant');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Tenant-specific
  const [tenantSlug, setTenantSlug] = useState('');

  // MFA state (tenant only)
  const [mfaToken, setMfaToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showMfa, setShowMfa]   = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setShowMfa(false);
    setMfaToken('');
    setTotpCode('');
  }

  // ── Platform admin submit ──────────────────────────────────────────────────
  async function handlePlatformSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await platformLogin(email, password);

      if (isMfaRequired(result)) {
        setError('MFA is not yet supported for platform admins in this UI.');
        setLoading(false);
        return;
      }

      const user = decodeTokenPayload(result.access_token);
      if (!user) { setError('Failed to decode token'); setLoading(false); return; }

      if (user.role !== 'super_admin') {
        setError('This login is for platform administrators only.');
        setLoading(false);
        return;
      }

      login(result.access_token, user);
      router.push('/platform-admin');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  // ── Tenant user submit ─────────────────────────────────────────────────────
  async function handleTenantSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const slug = tenantSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!slug) { setError('Please enter your store slug.'); setLoading(false); return; }

    try {
      const result = await tenantLogin(slug, email, password);

      if (isMfaRequired(result)) {
        setMfaToken(result.mfa_token);
        setShowMfa(true);
        setLoading(false);
        return;
      }

      completeTenantLogin(slug, result.access_token);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
      setLoading(false);
    }
  }

  // ── Tenant MFA verify ──────────────────────────────────────────────────────
  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const slug = tenantSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    try {
      const result = await tenantMfaVerify(slug, mfaToken, totpCode);

      if (isMfaRequired(result)) {
        setError('Unexpected MFA response');
        setLoading(false);
        return;
      }

      completeTenantLogin(slug, result.access_token);
    } catch (err: any) {
      setError(err.message ?? 'MFA verification failed');
      setLoading(false);
    }
  }

  function completeTenantLogin(slug: string, accessToken: string) {
    const user = decodeTokenPayload(accessToken);
    if (!user) { setError('Failed to decode token'); setLoading(false); return; }

    login(accessToken, user);

    if (user.role === 'tenant_admin' || user.role === 'operator') {
      router.push(`/tenant/${slug}/dashboard`);
    } else {
      router.push(`/tenant/${slug}`);
    }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
    boxSizing: 'border-box',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '0.6rem', textAlign: 'center',
    fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
    background: active ? '#fff' : 'transparent',
    color: active ? '#0f172a' : '#94a3b8',
    border: 'none', borderRadius: '8px',
    transition: 'all 0.15s',
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <a href="/" style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 800, fontSize: '1.5rem' }}>
            Gadnuc
          </a>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: '0.25rem', padding: '0.25rem',
          background: '#f1f5f9', borderRadius: '10px', marginBottom: '1rem',
          border: '1px solid #e2e8f0',
        }}>
          <button type="button" onClick={() => switchMode('tenant')} style={tabStyle(mode === 'tenant')}>
            Store Login
          </button>
          <button type="button" onClick={() => switchMode('platform')} style={tabStyle(mode === 'platform')}>
            Platform Admin
          </button>
        </div>

        {/* Login Card */}
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
        }}>

          {/* ── MFA screen (tenant only) ── */}
          {mode === 'tenant' && showMfa ? (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '0.5rem' }}>
                Two-Factor Authentication
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Enter the 6-digit code from your authenticator app.
              </p>
              <form onSubmit={handleMfa}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    autoFocus
                    style={{
                      ...inputStyle,
                      textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.5rem', fontWeight: 600,
                    }}
                  />
                </div>

                {error && (
                  <div style={{
                    background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem',
                    borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem',
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || totpCode.length !== 6} style={{
                  width: '100%', padding: '0.7rem',
                  background: loading || totpCode.length !== 6 ? '#94a3b8' : '#0f172a',
                  color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem',
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                  {loading ? 'Verifying...' : 'Verify'}
                </button>

                <button type="button" onClick={() => { setShowMfa(false); setError(''); setTotpCode(''); }}
                  style={{
                    width: '100%', padding: '0.5rem', marginTop: '0.75rem', background: 'none',
                    border: 'none', color: '#64748b', fontSize: '0.85rem', cursor: 'pointer',
                  }}
                >
                  Back to login
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem', marginTop: 0 }}>
                {mode === 'platform' ? 'Platform Admin Login' : 'Store Login'}
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {mode === 'platform'
                  ? 'Sign in to manage the Gadnuc platform.'
                  : 'Sign in to your store dashboard.'}
              </p>

              <form onSubmit={mode === 'platform' ? handlePlatformSubmit : handleTenantSubmit}>
                {/* Store slug — tenant mode only */}
                {mode === 'tenant' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                      Store Slug
                    </label>
                    <input
                      type="text"
                      placeholder="your-store"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      required
                      style={inputStyle}
                    />
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                      The unique identifier for your store
                    </p>
                  </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div style={{
                    background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem',
                    borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem',
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '0.7rem',
                    background: loading ? '#94a3b8' : (mode === 'platform' ? '#0f172a' : '#3b82f6'),
                    color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem',
                    fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <a href="/" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none' }}>
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
