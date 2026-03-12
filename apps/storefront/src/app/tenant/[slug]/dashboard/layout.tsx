'use client';

import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../components/AuthProvider';
import { useEffect } from 'react';

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params   = useParams();
  const router   = useRouter();
  const slug     = params.slug as string;
  const { user, isLoading, logout } = useAuth();

  // Auth guard — redirect to tenant login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/tenant/${slug}/login`);
    }
  }, [isLoading, user, slug, router]);

  if (isLoading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading...</div>;
  }

  if (!user) return null;

  const navItems = [
    { href: `/tenant/${slug}/dashboard`,            label: 'Overview' },
    { href: `/tenant/${slug}/dashboard/products`,   label: 'Products' },
    { href: `/tenant/${slug}/dashboard/appearance`,  label: 'Appearance' },
    { href: `/tenant/${slug}/dashboard/settings`,    label: 'Settings' },
    { href: `/tenant/${slug}/workspace`,            label: 'Workspace' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', flexShrink: 0, background: '#0f172a', color: '#e2e8f0',
        padding: '1.5rem 0', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f8fafc' }}>{slug}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {user.role.replace('_', ' ')}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {navItems.map(({ href, label }) => {
            const active = href === `/tenant/${slug}/dashboard`
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link key={href} href={href} style={{
                display: 'block', padding: '0.6rem 1.25rem',
                color: active ? '#f8fafc' : '#94a3b8',
                background: active ? '#1e293b' : 'transparent',
                textDecoration: 'none', fontSize: '0.875rem',
                borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'all 0.15s',
              }}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link href={`/tenant/${slug}`} style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.75rem' }}>
            ← View storefront
          </Link>
          <button onClick={() => { logout(); router.push(`/tenant/${slug}/login`); }} style={{
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
