'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useEffect } from 'react';

/**
 * Dashboard layout — auth guard only.
 * The sidebar is now rendered by StorefrontShell/AdminSidebar globally
 * for all tenant pages when the user is logged in.
 */
export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  const params   = useParams();
  const router   = useRouter();
  const slug     = params.slug as string;
  const { user, isLoading } = useAuth();

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

  return <>{children}</>;
}
