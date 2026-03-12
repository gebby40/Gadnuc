'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { AdminSidebar } from './AdminSidebar';

interface Props {
  slug: string;
  nav: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Auth-aware layout shell for tenant pages.
 *
 * - Login page        → bare children (no chrome)
 * - Logged-in admin   → AdminSidebar + content on ALL pages
 * - Visitor / loading → StorefrontNav + Footer on storefront pages,
 *                       bare children on /dashboard routes
 */
export function StorefrontShell({ slug, nav, footer, children }: Props) {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();

  const isLoginPage  = pathname.includes('/login');
  const isDashboard  = pathname.includes('/dashboard');
  const isAdmin      = user && (user.role === 'tenant_admin' || user.role === 'operator');

  // Login page: never show any chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Logged-in admin/operator: persistent sidebar on every page
  if (!isLoading && isAdmin) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <AdminSidebar slug={slug} user={user} onLogout={logout} />
        <main style={{
          flex: 1,
          overflow: 'auto',
          background: isDashboard ? '#f8fafc' : undefined,
        }}>
          {children}
        </main>
      </div>
    );
  }

  // Not logged in (or loading, or viewer role):
  // Dashboard paths → bare children (dashboard layout has its own auth guard)
  if (isDashboard) {
    return <>{children}</>;
  }

  // Public storefront layout
  return (
    <>
      {nav}
      <main className="flex-1" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {children}
      </main>
      {footer}
    </>
  );
}
