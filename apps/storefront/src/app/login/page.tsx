'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import {
  tenantLoginDiscover,
  tenantMfaVerify,
  decodeTokenPayload,
  isMfaRequired,
} from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // MFA state
  const [mfaToken, setMfaToken]             = useState('');
  const [mfaTenantSlug, setMfaTenantSlug]   = useState('');
  const [totpCode, setTotpCode]             = useState('');
  const [showMfa, setShowMfa]               = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await tenantLoginDiscover(email, password);

      if (isMfaRequired(result)) {
        setMfaToken(result.mfa_token);
        setMfaTenantSlug(result.tenant_slug ?? '');
        setShowMfa(true);
        setLoading(false);
        return;
      }

      completeLogin(result.access_token, result.tenant_slug);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await tenantMfaVerify(mfaTenantSlug, mfaToken, totpCode);

      if (isMfaRequired(result)) {
        setError('Unexpected MFA response');
        setLoading(false);
        return;
      }

      completeLogin(result.access_token, mfaTenantSlug || result.tenant_slug);
    } catch (err: any) {
      setError(err.message ?? 'MFA verification failed');
      setLoading(false);
    }
  }

  function completeLogin(accessToken: string, slug?: string) {
    const user = decodeTokenPayload(accessToken);
    if (!user) { setError('Failed to decode token'); setLoading(false); return; }

    const tenantSlug = slug || user.tenantSlug;
    login(accessToken, user);

    if (user.role === 'tenant_admin' || user.role === 'operator') {
      router.push(`/tenant/${tenantSlug}/dashboard`);
    } else {
      router.push(`/tenant/${tenantSlug}`);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
    boxSizing: 'border-box',
  };

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

        {/* Login Card */}
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
        }}>
          {showMfa ? (
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
                  background: loading || totpCode.length !== 6 ? '#94a3b8' : '#3b82f6',
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
                Sign In
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Sign in to your store dashboard.
              </p>

              <form onSubmit={handleLogin}>
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
                    background: loading ? '#94a3b8' : '#3b82f6',
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
