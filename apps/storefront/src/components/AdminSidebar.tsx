'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/auth';

interface Props {
  slug: string;
  user: AuthUser;
  onLogout: () => void;
}

/**
 * Persistent admin sidebar shown on ALL tenant pages when the user
 * is logged in as an operator or tenant_admin.
 * Two nav sections: management pages + storefront browsing.
 */
export function AdminSidebar({ slug, user, onLogout }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const base     = `/tenant/${slug}`;

  const manageItems = [
    { href: `${base}/dashboard`,             label: 'Dashboard' },
    { href: `${base}/dashboard/products`,    label: 'Products' },
    { href: `${base}/dashboard/appearance`,  label: 'Appearance' },
    { href: `${base}/dashboard/settings`,    label: 'Settings' },
  ];

  const storeItems = [
    { href: base,                label: 'Storefront' },
    { href: `${base}/products`,  label: 'Browse Products' },
    { href: `${base}/cart`,      label: 'Cart' },
    { href: `${base}/workspace`, label: 'Workspace' },
  ];

  function isActive(href: string): boolean {
    // Dashboard overview: exact match only
    if (href === `${base}/dashboard`) return pathname === href;
    // Storefront home: exact match only
    if (href === base) return pathname === base;
    // Everything else: prefix match
    return pathname.startsWith(href);
  }

  function handleLogout() {
    onLogout();
    router.push(`${base}/login`);
  }

  return (
    <aside style={{
      width: '220px', flexShrink: 0, background: '#0f172a', color: '#e2e8f0',
      padding: '1.5rem 0', display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Tenant name + role */}
      <div style={{ padding: '0 1.25rem 1.25rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f8fafc' }}>{slug}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
          {user.role.replace('_', ' ')}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflow: 'auto' }}>
        {/* Manage section */}
        <div style={{ padding: '0.75rem 1.25rem 0.25rem', fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Manage
        </div>
        {manageItems.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} style={{
              display: 'block', padding: '0.55rem 1.25rem',
              color: active ? '#f8fafc' : '#94a3b8',
              background: active ? '#1e293b' : 'transparent',
              textDecoration: 'none', fontSize: '0.85rem',
              borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.15s',
            }}>
              {label}
            </Link>
          );
        })}

        {/* Store section */}
        <div style={{ padding: '1rem 1.25rem 0.25rem', fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Store
        </div>
        {storeItems.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} style={{
              display: 'block', padding: '0.55rem 1.25rem',
              color: active ? '#f8fafc' : '#94a3b8',
              background: active ? '#1e293b' : 'transparent',
              textDecoration: 'none', fontSize: '0.85rem',
              borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.15s',
            }}>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: sign out */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b' }}>
        <button onClick={handleLogout} style={{
          background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem',
          cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
