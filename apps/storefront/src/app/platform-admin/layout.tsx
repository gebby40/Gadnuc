'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { platformLogout } from '../../lib/auth';

const navItems = [
  { href: '/platform-admin',         label: 'Overview' },
  { href: '/platform-admin/tenants', label: 'Tenants' },
  { href: '/platform-admin/flags',   label: 'Feature Flags' },
];

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, isLoading, logout } = useAuth();

  // Auth guard — redirect to /login if not super_admin
  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'super_admin')) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>;
  }

  if (!user || user.role !== 'super_admin') return null;

  async function handleLogout() {
    await platformLogout();
    logout();
    router.push('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', flexShrink: 0, background: '#0f172a', color: '#e2e8f0',
        padding: '1.5rem 0', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f8fafc' }}>Gadnuc</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Platform Admin</div>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {navItems.map(({ href, label }) => {
            const active = pathname === href || (href !== '/platform-admin' && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'block', padding: '0.6rem 1.25rem',
                  color: active ? '#f8fafc' : '#94a3b8',
                  background: active ? '#1e293b' : 'transparent',
                  textDecoration: 'none', fontSize: '0.875rem',
                  borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link href="/" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.75rem' }}>
            ← Back to homepage
          </Link>
          <button onClick={handleLogout} style={{
            background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem',
            cursor: 'pointer', padding: 0, textAlign: 'left',
          }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, background: '#f8fafc', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
