'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../../components/AuthProvider';
import { customerRegister, decodeTokenPayload } from '../../../../../lib/auth';

export default function CustomerRegisterPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { login } = useAuth();
  const base = `/tenant/${slug}`;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPw) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const result = await customerRegister(slug, {
        email,
        password,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      });
      const user = decodeTokenPayload(result.access_token);
      if (user) {
        login(result.access_token, user);
        router.push(`${base}/account`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', background: '#fff',
        borderRadius: '12px', border: '1px solid #e2e8f0', padding: '2rem',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem' }}>
          Create Account
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
          Create an account to track orders and save your details for faster checkout.
        </p>

        {error && (
          <div style={{
            padding: '0.75rem 1rem', background: '#fef2f2', color: '#dc2626',
            borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                style={inputStyle}
                placeholder="John"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                style={inputStyle}
                placeholder="Doe"
              />
            </div>
          </div>

          <label style={labelStyle}>Email *</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
            placeholder="you@example.com"
          />

          <label style={labelStyle}>Password *</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
            placeholder="At least 8 characters"
          />

          <label style={labelStyle}>Confirm Password *</label>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
            style={inputStyle}
            placeholder="Re-enter password"
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.65rem', background: '#0f172a', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer', marginTop: '1rem',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b', marginTop: '1.25rem' }}>
          Already have an account?{' '}
          <Link href={`${base}/account/login`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>

        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <Link href={base} style={{ fontSize: '0.8rem', color: '#94a3b8', textDecoration: 'none' }}>
            ← Back to store
          </Link>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: '#374151', marginBottom: '0.35rem', marginTop: '0.75rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box',
};
