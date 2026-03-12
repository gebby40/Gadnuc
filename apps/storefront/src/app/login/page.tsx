'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { platformLogin, decodeTokenPayload } from '../../lib/auth';

export default function PlatformLoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Tenant redirect helper
  const [tenantSlug, setTenantSlug] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await platformLogin(email, password);

      if ('mfa_required' in result) {
        setError('MFA is not yet supported for platform admins in this UI.');
        setLoading(false);
        return;
      }

      const user = decodeTokenPayload(result.access_token);
      if (!user) {
        setError('Failed to decode token');
        setLoading(false);
        return;
      }

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

  function goToTenant() {
    const slug = tenantSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (slug) {
      router.push(`/tenant/${slug}/login`);
    }
  }

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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem', marginTop: 0 }}>
            Platform Admin Login
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Sign in to manage the Gadnuc platform.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                  border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                  border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
                  boxSizing: 'border-box',
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

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.7rem', background: loading ? '#94a3b8' : '#0f172a',
                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem',
                fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Tenant redirect */}
        <div style={{
          marginTop: '1.5rem', background: '#fff', borderRadius: '12px', padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
        }}>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0, marginBottom: '0.75rem' }}>
            Tenant user? Go to your store login:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="your-store-slug"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goToTenant()}
              style={{
                flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px',
                border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
              }}
            />
            <button
              onClick={goToTenant}
              style={{
                padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '0.85rem',
                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Go
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0.5rem 0 0' }}>
            You'll be redirected to gadnuc.com/tenant/your-store-slug/login
          </p>
        </div>
      </div>
    </div>
  );
}
