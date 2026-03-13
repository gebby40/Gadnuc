'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Redirect: Appearance settings have moved to Storefront Settings.
 * This redirect ensures old bookmarks still work.
 */
export default function AppearanceRedirect() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  useEffect(() => {
    router.replace(`/tenant/${slug}/dashboard/storefront-settings`);
  }, [slug, router]);

  return (
    <div style={{ padding: '2rem', color: '#64748b', fontSize: '0.9rem' }}>
      Redirecting to Storefront Settings...
    </div>
  );
}
