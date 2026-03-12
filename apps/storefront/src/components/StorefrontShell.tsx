'use client';

import { usePathname } from 'next/navigation';

interface Props {
  nav: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders the storefront chrome (nav + footer + <main> wrapper)
 * on customer-facing pages, but strips it on /dashboard routes so the
 * dashboard layout can provide its own sidebar/header without double-framing.
 */
export function StorefrontShell({ nav, footer, children }: Props) {
  const pathname = usePathname();
  const isDashboard = pathname.includes('/dashboard');

  if (isDashboard) {
    return <>{children}</>;
  }

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
