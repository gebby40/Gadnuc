'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/auth';

interface Props {
  slug: string;
  user: AuthUser;
  onLogout: () => void;
}

interface NavItem {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

/**
 * Persistent admin sidebar shown on ALL tenant pages when the user
 * is logged in as an operator or tenant_admin.
 * Two nav sections: management pages + storefront browsing.
 * Supports expandable sub-items under parent nav entries.
 */
export function AdminSidebar({ slug, user, onLogout }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const base     = `/tenant/${slug}`;

  const manageItems: NavItem[] = [
    { href: `${base}/dashboard`,          label: 'Dashboard' },
    { href: `${base}/dashboard/products`, label: 'Products' },
  ];

  const storeItems: NavItem[] = [
    {
      href: base,
      label: 'Storefront',
      children: [
        { href: `${base}/dashboard/storefront-settings`, label: 'Settings' },
      ],
    },
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
        {manageItems.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive} />
        ))}

        {/* Store section */}
        <div style={{ padding: '1rem 1.25rem 0.25rem', fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Store
        </div>
        {storeItems.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive} />
        ))}
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

/** Single nav link with optional expandable children */
function NavLink({ item, isActive }: { item: NavItem; isActive: (href: string) => boolean }) {
  const hasChildren = item.children && item.children.length > 0;
  const parentActive = isActive(item.href);
  const anyChildActive = hasChildren && item.children!.some((c) => isActive(c.href));
  const [expanded, setExpanded] = useState(parentActive || anyChildActive);

  const active = parentActive;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Link href={item.href} style={{
          display: 'block', padding: '0.55rem 1.25rem', flex: 1,
          color: active ? '#f8fafc' : '#94a3b8',
          background: active ? '#1e293b' : 'transparent',
          textDecoration: 'none', fontSize: '0.85rem',
          borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
          transition: 'all 0.15s',
        }}>
          {item.label}
        </Link>
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
              padding: '0.55rem 0.75rem', fontSize: '0.7rem', lineHeight: 1,
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            ▸
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {item.children!.map((child) => {
            const childActive = isActive(child.href);
            return (
              <Link key={child.href} href={child.href} style={{
                display: 'block', padding: '0.4rem 1.25rem 0.4rem 2.25rem',
                color: childActive ? '#f8fafc' : '#94a3b8',
                background: childActive ? '#1e293b' : 'transparent',
                textDecoration: 'none', fontSize: '0.8rem',
                borderLeft: childActive ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'all 0.15s',
              }}>
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
